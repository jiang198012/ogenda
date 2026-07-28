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
  conflicts: number;
  deleted: number;
  markedServerDeleted: number;
  store: SyncSummary;
}

function withBaseHash(ev: AgendaEvent): AgendaEvent {
  return { ...ev, baseHash: hashEvent(ev) };
}

function resourceUrl(calendarUrl: string, uid: string): string {
  return calendarUrl.replace(/\/?$/, "/") + encodeURIComponent(uid) + ".ics";
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

export async function syncBidirectional(
  source: CalDavSource,
  calendarUrl: string,
  store: MonthlyStore,
  notify: Notify,
): Promise<BidirectionalSummary> {
  const [read, server] = await Promise.all([store.readEvents(), source.fetch()]);
  const local = read.events;
  const syncState = await store.readSyncState();
  const plan = planSync(server, local, syncState.tracked);

  const toApply: AgendaEvent[] = plan.applyServer.map(withBaseHash);
  let pushed = 0;
  let created = 0;

  for (const ev of plan.pushUpdate) {
    // planSync only puts events with hasHref === true into pushUpdate, so href is always set here.
    const res = await source.putEvent(ev.href!, eventToVCalendar(ev), ev.etag);
    if (isOk(res.status)) {
      toApply.push(withBaseHash({ ...ev, etag: res.etag ?? ev.etag }));
      pushed++;
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
  }

  for (const ev of plan.pushCreate) {
    const url = resourceUrl(calendarUrl, ev.uid);
    const res = await source.putEvent(url, eventToVCalendar(ev));
    if (isOk(res.status)) {
      toApply.push(withBaseHash({ ...ev, origin: "synced", href: url, etag: res.etag }));
      created++;
    } else {
      notify(t("sync.createFailed", { title: ev.title, status: res.status }));
      console.error(`[ogenda] pushCreate failed for ${ev.uid} (${ev.title}): HTTP ${res.status}`, {
        url,
        ics: eventToVCalendar(ev),
        responseBody: res.text,
      });
    }
  }

  for (const c of plan.conflicts) {
    toApply.push(withBaseHash(c.server));
    notify(t("sync.conflict", { title: c.server.title }));
  }

  let deleted = 0;
  const confirmedDeleted: string[] = [];
  for (const d of plan.deleteRemote) {
    const res = await source.deleteEvent(d.href, d.etag);
    if (isOk(res.status) || res.status === 404) {
      confirmedDeleted.push(d.uid);
      deleted++;
    } else if (res.status === 412) {
      notify(t("sync.deleteSkipped", { uid: d.uid }));
    } else {
      notify(t("sync.deleteFailed", { uid: d.uid, status: res.status }));
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

  const summary = await store.sync(toApply);
  // written after store.sync succeeds, so a failed sync doesn't leave the ledger ahead of
  // what's actually on disk (e.g. a pushCreate's new href tracked but never written locally).
  await store.writeSyncState({ tracked: newTracked });
  notify(
    t("sync.complete", {
      applied: plan.applyServer.length,
      pushed,
      created,
      conflicts: plan.conflicts.length,
      deleted,
      serverDeleted: markedServerDeleted,
      months: summary.months.join(", ") || t("sync.noChange"),
    }),
  );

  return {
    pulled: plan.applyServer.length,
    pushed,
    created,
    conflicts: plan.conflicts.length,
    deleted,
    markedServerDeleted,
    store: summary,
  };
}
