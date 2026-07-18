import { AgendaEvent, hashEvent } from "../core/event";
import { eventToVCalendar } from "../core/ical-gen";
import { MonthlyStore, SyncSummary } from "../store/monthly-store";
import { planSync } from "./plan";

export type Notify = (message: string) => void;

export interface CalDavSource {
  fetch(): Promise<AgendaEvent[]>;
  putEvent(url: string, ics: string, ifMatch?: string): Promise<{ status: number; etag?: string }>;
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
  const [local, server] = await Promise.all([store.readEvents(), source.fetch()]);
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
      notify(`本地改动未推送(${ev.title}):服务器版本已变,已跳过,下次同步会拉取服务器较新版本`);
    } else {
      notify(`推送失败(${ev.title}):HTTP ${res.status}`);
    }
  }

  for (const ev of plan.pushCreate) {
    const url = resourceUrl(calendarUrl, ev.uid);
    const res = await source.putEvent(url, eventToVCalendar(ev));
    if (isOk(res.status)) {
      toApply.push(withBaseHash({ ...ev, origin: "synced", href: url, etag: res.etag }));
      created++;
    } else {
      notify(`创建失败(${ev.title}):HTTP ${res.status}`);
    }
  }

  for (const c of plan.conflicts) {
    toApply.push(withBaseHash(c.server));
    notify(`冲突(${c.server.title}):本地改动已被服务器较新版本覆盖`);
  }

  let deleted = 0;
  const confirmedDeleted: string[] = [];
  for (const d of plan.deleteRemote) {
    const res = await source.deleteEvent(d.href, d.etag);
    if (isOk(res.status) || res.status === 404) {
      confirmedDeleted.push(d.uid);
      deleted++;
    } else if (res.status === 412) {
      notify(`删除未推送(${d.uid}):服务器版本已变,已跳过,下次同步重试`);
    } else {
      notify(`删除失败(${d.uid}):HTTP ${res.status}`);
    }
  }
  if (confirmedDeleted.length) await store.removeByUid(confirmedDeleted);

  for (const ev of plan.markServerDeleted) {
    toApply.push(withBaseHash(ev));
  }
  const markedServerDeleted = plan.markServerDeleted.length;

  // tracked-state ledger (D3): drop uids that are now confirmed-deleted or gone from both
  // sides, and (re-)record every href+etag-bearing entry that's about to be written locally.
  const localUids = new Set(local.map((l) => l.uid));
  const serverUids = new Set(server.map((s) => s.uid));
  const bothGone = Object.keys(syncState.tracked).filter(
    (uid) => !localUids.has(uid) && !serverUids.has(uid),
  );
  const newTracked: Record<string, { href: string; etag: string }> = { ...syncState.tracked };
  for (const uid of confirmedDeleted) delete newTracked[uid];
  for (const uid of bothGone) delete newTracked[uid];
  for (const ev of toApply) {
    if (ev.href && ev.etag) newTracked[ev.uid] = { href: ev.href, etag: ev.etag };
  }
  await store.writeSyncState({ tracked: newTracked });

  const summary = await store.sync(toApply);
  notify(
    `双向同步完成:拉取 ${plan.applyServer.length}、推送 ${pushed}、新建 ${created}、冲突 ${plan.conflicts.length}、` +
      `删除 ${deleted}、服务器已删 ${markedServerDeleted}` +
      `(${summary.months.join(", ") || "无变化"})`,
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
