import { AgendaEvent, hashEvent } from "../core/event";
import { LocalEvent, monthOf } from "../store/monthly-store";
import { fieldsToEvent } from "../sync/plan";

export interface AgendaStats {
  total: number;
  byStatus: Record<string, number>;
  allDayCount: number;
  timedCount: number;
  recurringCount: number;
  onceCount: number;
  byCategory: Record<string, number>;
  busiestDays: { date: string; count: number }[];
  unsyncedCount: number;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function computeStats(events: AgendaEvent[], local: LocalEvent[], monthAnchor: Date): AgendaStats {
  const targetMonth = monthKey(monthAnchor);
  const monthEvents = events.filter((e) => monthOf(e.start) === targetMonth);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let allDayCount = 0;
  let timedCount = 0;
  let recurringCount = 0;
  let onceCount = 0;
  const dayCounts = new Map<string, number>();

  for (const ev of monthEvents) {
    const statusKey = ev.status ?? "未设置";
    byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;
    const catKey = ev.category ?? "未分类";
    byCategory[catKey] = (byCategory[catKey] ?? 0) + 1;
    if (ev.allDay) allDayCount++;
    else timedCount++;
    if (ev.rrule) recurringCount++;
    else onceCount++;
    const dayKey = ev.start.slice(0, 10);
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
  }

  const busiestDays = [...dayCounts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count || (a.date < b.date ? -1 : 1))
    .slice(0, 3);

  const monthLocal = local.filter((l) => monthOf(l.fields["start"] ?? "") === targetMonth);
  const unsyncedCount = monthLocal.filter((l) => {
    if (!l.hasHref) return true;
    return hashEvent(fieldsToEvent(l.fields)) !== (l.fields["base_hash"] ?? "");
  }).length;

  return {
    total: monthEvents.length,
    byStatus,
    allDayCount,
    timedCount,
    recurringCount,
    onceCount,
    byCategory,
    busiestDays,
    unsyncedCount,
  };
}
