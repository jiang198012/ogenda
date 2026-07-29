import { AgendaEvent, hashEvent } from "../core/event";
import { eventToVCalendar } from "../core/ical-gen";
import { MonthlyStore, SyncSummary } from "../store/monthly-store";
import { planSync } from "./plan";
import { t } from "../i18n";

export type Notify = (message: string) => void;

export interface CalDavSource {
  fetch(): Promise<AgendaEvent[]>;
  putEvent(url: string, ics: string, ifMatch?: string): Promise<{ status: number; etag?: string; text?: string }>;
  deleteEvent(url: string, ifMatch: string): Promise<{ status: number }>;
}

export interface BidirectionalSummary {
  pulled: number;
  pushed: number;
  created: number;
  adopted: number;
  /** No-href local events left for future rounds because this round hit the create cap. */
  createBacklog: number;
  conflicts: number;
  deleted: number;
  markedServerDeleted: number;
  store: SyncSummary;
}

export interface SyncOptions {
  /** Max PUT-creates per round; a larger backlog drains across rounds. Default 100. */
  maxCreatesPerRound?: number;
  /** Pause between server write requests, to stay under server-side throttling. Default 250. */
  paceMs?: number;
  /** Backoff delays (ms) for retrying a write that got HTTP 503. Default [2000, 5000]. */
  retry503Delays?: number[];
  /** Persist accumulated local changes to disk every N staged events. Default 10. */
  flushEvery?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_CREATES = 100;
const DEFAULT_PACE_MS = 250;
const DEFAULT_RETRY_503 = [2000, 5000];
const DEFAULT_FLUSH_EVERY = 10;

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function withBaseHash(ev: AgendaEvent): AgendaEvent {
  return { ...ev, baseHash: hashEvent(ev) };
}

function resourceUrl(calendarUrl: string, uid: string): string {
  return calendarUrl.replace(/\/?$/, "/") + encodeURIComponent(uid) + ".ics";
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function syncBidirectional(
  source: CalDavSource,
  calendarUrl: string,
  store: MonthlyStore,
  notify: Notify,
  opts: SyncOptions = {},
): Promise<BidirectionalSummary> {
  const maxCreates = opts.maxCreatesPerRound ?? DEFAULT_MAX_CREATES;
  const paceMs = opts.paceMs ?? DEFAULT_PACE_MS;
  const retry503 = opts.retry503Delays ?? DEFAULT_RETRY_503;
  const flushEvery = Math.max(1, opts.flushEvery ?? DEFAULT_FLUSH_EVERY);
  const sleep = opts.sleep ?? realSleep;

  const [read, server] = await Promise.all([store.readEvents(), source.fetch()]);
  const local = read.events;
  const syncState = await store.readSyncState();
  const plan = planSync(server, local, syncState.tracked);

  // Adopted events already carry the SERVER event's baseHash from planSync — never re-hash them.
  const toApply: AgendaEvent[] = plan.applyServer.map(withBaseHash);
  toApply.push(...plan.adopt);

  // Incremental persistence: staged changes reach disk in batches during the round, so an
  // abort (timeout, crash, quitting Obsidian) can only lose the events staged since the
  // last flush — never the whole round. The tracked-state ledger is still written once at
  // the end so it can never run ahead of what's actually on disk.
  const storeSummary: SyncSummary = { added: 0, updated: 0, months: [] };
  let flushedUpTo = 0;
  const flush = async (): Promise<void> => {
    if (flushedUpTo >= toApply.length) return;
    const s = await store.sync(toApply.slice(flushedUpTo));
    flushedUpTo = toApply.length;
    storeSummary.added += s.added;
    storeSummary.updated += s.updated;
    for (const m of s.months) if (!storeSummary.months.includes(m)) storeSummary.months.push(m);
  };
  const flushIfDue = async (): Promise<void> => {
    if (toApply.length - flushedUpTo >= flushEvery) await flush();
  };
  await flush(); // pulls + adoptions are local-only; persist them before any server write

  // Throttle pacing: sleep before every server write except the first.
  let writes = 0;
  const pace = async (): Promise<void> => {
    if (writes++ > 0 && paceMs > 0) await sleep(paceMs);
  };
  const putWith503Retry = async (url: string, ics: string, ifMatch?: string) => {
    let res = await source.putEvent(url, ics, ifMatch);
    for (const delay of retry503) {
      if (res.status !== 503) break;
      await sleep(delay);
      writes++;
      res = await source.putEvent(url, ics, ifMatch);
    }
    return res;
  };

  let pushed = 0;
  let created = 0;

  for (const ev of plan.pushUpdate) {
    // planSync only puts events with hasHref === true into pushUpdate, so href is always set here.
    await pace();
    try {
      const res = await putWith503Retry(ev.href!, eventToVCalendar(ev), ev.etag);
      if (isOk(res.status)) {
        toApply.push(withBaseHash({ ...ev, etag: res.etag ?? ev.etag }));
        pushed++;
        await flushIfDue();
      } else if (res.status === 412) {
        notify(t("sync.pushSkipped", { title: ev.title }));
      } else {
        notify(t("sync.pushFailed", { title: ev.title, status: res.status }));
        console.error(`[ogenda] pushUpdate failed for ${ev.uid} (${ev.title}): HTTP ${res.status}`, {
          url: ev.href,
          ics: eventToVCalendar(ev),
          responseBody: res.text,
        });
      }
    } catch (e) {
      // one bad event must never abort the round — the rest still apply and persist
      notify(t("sync.pushFailedNet", { title: ev.title, msg: errMsg(e) }));
      console.error(`[ogenda] pushUpdate threw for ${ev.uid} (${ev.title})`, e);
    }
  }

  const creates = plan.pushCreate.slice(0, Math.max(0, maxCreates));
  const createBacklog = plan.pushCreate.length - creates.length;
  for (const ev of creates) {
    const url = resourceUrl(calendarUrl, ev.uid);
    await pace();
    try {
      const res = await putWith503Retry(url, eventToVCalendar(ev));
      if (isOk(res.status)) {
        toApply.push(withBaseHash({ ...ev, origin: "synced", href: url, etag: res.etag }));
        created++;
        await flushIfDue();
      } else {
        notify(t("sync.createFailed", { title: ev.title, status: res.status }));
        console.error(`[ogenda] pushCreate failed for ${ev.uid} (${ev.title}): HTTP ${res.status}`, {
          url,
          ics: eventToVCalendar(ev),
          responseBody: res.text,
        });
      }
    } catch (e) {
      notify(t("sync.createFailedNet", { title: ev.title, msg: errMsg(e) }));
      console.error(`[ogenda] pushCreate threw for ${ev.uid} (${ev.title})`, e);
    }
  }
  if (createBacklog > 0) {
    notify(t("sync.createRemaining", { done: creates.length, created, remaining: createBacklog }));
  }

  for (const c of plan.conflicts) {
    toApply.push(withBaseHash(c.server));
    notify(t("sync.conflict", { title: c.server.title }));
    await flushIfDue();
  }

  let deleted = 0;
  const confirmedDeleted: string[] = [];
  for (const d of plan.deleteRemote) {
    await pace();
    try {
      const res = await source.deleteEvent(d.href, d.etag);
      if (isOk(res.status) || res.status === 404) {
        confirmedDeleted.push(d.uid);
        deleted++;
      } else if (res.status === 412) {
        notify(t("sync.deleteSkipped", { uid: d.uid }));
      } else {
        notify(t("sync.deleteFailed", { uid: d.uid, status: res.status }));
      }
    } catch (e) {
      notify(t("sync.deleteFailedNet", { uid: d.uid, msg: errMsg(e) }));
      console.error(`[ogenda] deleteRemote threw for ${d.uid}`, e);
    }
  }
  if (confirmedDeleted.length) await store.removeByUid(confirmedDeleted);

  for (const ev of plan.markServerDeleted) {
    toApply.push(withBaseHash(ev));
  }
  const markedServerDeleted = plan.markServerDeleted.length;

  // tracked-state ledger (D3): rebuilt fresh each round, not carried forward from the old
  // ledger — anything confirmed present on both sides is (re)tracked, anything not
  // re-derived here (deleted, gone from one side, or never synced) is naturally dropped.
  // Building it this way (rather than copying the old ledger and subtracting) is what lets
  // events that were already synced under pre-D3 code get seeded into tracking on their
  // first D3 sync, even when nothing about them changed this round.
  const serverByUidForTracking = new Map(server.map((s) => [s.uid, s]));
  const newTracked: Record<string, { href: string; etag: string }> = {};
  for (const l of local) {
    if (!l.hasHref) continue;
    const s = serverByUidForTracking.get(l.uid);
    if (s?.href && s?.etag) newTracked[l.uid] = { href: s.href, etag: s.etag };
  }
  for (const ev of toApply) {
    if (ev.href && ev.etag) newTracked[ev.uid] = { href: ev.href, etag: ev.etag };
  }
  // a deleteRemote uid that wasn't confirmed deleted (412/error) must stay tracked, or the
  // next sync loses the memory that this was a pending local deletion and instead treats it
  // as a brand-new server event — silently resurrecting what the user deleted.
  for (const d of plan.deleteRemote) {
    if (!confirmedDeleted.includes(d.uid)) newTracked[d.uid] = { href: d.href, etag: d.etag };
  }

  await flush();
  // written after the final flush, so a failed sync doesn't leave the ledger ahead of
  // what's actually on disk (e.g. a pushCreate's new href tracked but never written locally).
  await store.writeSyncState({ tracked: newTracked });
  notify(
    t("sync.complete", {
      applied: plan.applyServer.length,
      adopted: plan.adopt.length,
      pushed,
      created,
      conflicts: plan.conflicts.length,
      deleted,
      serverDeleted: markedServerDeleted,
      months: storeSummary.months.join(", ") || t("sync.noChange"),
    }),
  );

  return {
    pulled: plan.applyServer.length,
    pushed,
    created,
    adopted: plan.adopt.length,
    createBacklog,
    conflicts: plan.conflicts.length,
    deleted,
    markedServerDeleted,
    store: storeSummary,
  };
}
