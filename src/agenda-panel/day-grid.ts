// 日视图时间格布局(纯逻辑):把一天的 occurrences 换算成可定位的格子,
// 以及拖动(新建/移动/改时长)的分钟换算。不依赖 Obsidian,便于单测。
import { AgendaEvent } from "../core/event";
import { EventOccurrence, parseLocalDate } from "./occurrences";
import { startOfDay, addDays, toDateKey } from "./date-grid";
import { TimeSegment, visibleRange, VisibleRange } from "./time-segments";

/** 每小时的像素高度(由视图 CSS 使用)。 */
export const HOUR_PX = 40;
/** 拖动吸附粒度(分钟)。 */
export const SNAP_MIN = 15;
/** 最小显示时长(分钟):无 end 的事件至少占这么高。 */
export const MIN_VISIBLE_MIN = 30;

export interface DayEventLayout {
  occ: EventOccurrence;
  /** 距离当天 0 点的分钟数(裁剪到 0..1440)。 */
  topMin: number;
  /** 结束分钟数(裁剪到 0..1440;至少 topMin + MIN_VISIBLE_MIN)。 */
  bottomMin: number;
  /** 重叠布局:第几列(0 起)。 */
  column: number;
  /** 总列数。 */
  columns: number;
}

export interface DayGridLayout {
  /** 全天/跨天事件(顶部横条,不参与时间格)。 */
  allDay: EventOccurrence[];
  /** 时间格内的事件(带定位)。 */
  timed: DayEventLayout[];
}

/** 当天的 0 点。 */
export function dayStartOf(day: Date): Date {
  return startOfDay(day);
}

/** ISO 时间 → 当天 0 点起的分钟数(0..1440)。 */
export function isoToMinutes(iso: string, day: Date): number {
  const d = parseLocalDate(iso);
  const base = startOfDay(day).getTime();
  const clamped = Math.min(Math.max(d.getTime(), base), base + 86400_000);
  return Math.round((clamped - base) / 60_000);
}

/** 当天 0 点 + 分钟数 → ISO(本地)。跨出当天时顺延/前移日期。 */
export function minutesToIso(day: Date, minutes: number): string {
  const d = startOfDay(day);
  d.setMinutes(d.getMinutes() + minutes);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/** 向下吸附到 SNAP_MIN 的倍数(0..1440)。 */
export function snapMinutes(m: number): number {
  const snapped = Math.floor(m / SNAP_MIN) * SNAP_MIN;
  return Math.min(Math.max(snapped, 0), 1440);
}

/** 布局一天的 occurrences。全天事件进顶部横条;timed 按重叠分列。
 *  range 可选:只展示 [startMin, endMin) 窗口——窗口外的事件不显示,
 *  跨边界事件按窗口裁剪(与跨天裁剪同语义)。默认全天 0..1440。 */
export function layoutDayGrid(
  occurrences: EventOccurrence[],
  day: Date,
  range?: { startMin: number; endMin: number },
): DayGridLayout {
  const base = startOfDay(day).getTime();
  const dayEnd = base + 86400_000;
  const lo = Math.max(0, Math.min(range?.startMin ?? 0, 1440));
  const hi = Math.min(1440, Math.max(range?.endMin ?? 1440, lo));

  const allDay: EventOccurrence[] = [];
  const timedRaw: { occ: EventOccurrence; topMin: number; bottomMin: number }[] = [];

  for (const occ of occurrences) {
    if (occ.event.allDay) {
      allDay.push(occ);
      continue;
    }
    const s = parseLocalDate(occ.start).getTime();
    const e = occ.end ? parseLocalDate(occ.end).getTime() : undefined;
    if (e !== undefined && e <= base) continue; // 完全在昨天结束
    if (s >= dayEnd) continue; // 完全在明天开始

    const topMin = Math.round(Math.max(s - base, 0) / 60_000);
    const bottomMin =
      e === undefined
        ? topMin + MIN_VISIBLE_MIN
        : Math.round(Math.min(e - base, 86400_000) / 60_000);

    // 窗口裁剪:完全在窗口外不显示;跨窗口边界裁剪可见部分。
    if (bottomMin <= lo) continue;
    if (topMin >= hi) continue;
    const t = Math.min(Math.max(topMin, lo), hi);
    const b = Math.min(Math.max(bottomMin, t + MIN_VISIBLE_MIN), hi);
    if (b <= t) continue; // 窗口太窄放不下
    timedRaw.push({ occ, topMin: t, bottomMin: b });
  }

  // 按开始时间排序,贪心分列:维护每列的当前结束时间。
  timedRaw.sort((a, b) => a.topMin - b.topMin || b.bottomMin - a.bottomMin);
  const colEnd: number[] = [];
  const withCol: { occ: EventOccurrence; topMin: number; bottomMin: number; column: number }[] = [];
  for (const t of timedRaw) {
    let col = colEnd.findIndex((end) => end <= t.topMin);
    if (col === -1) {
      col = colEnd.length;
      colEnd.push(0);
    }
    colEnd[col] = t.bottomMin;
    withCol.push({ ...t, column: col });
  }
  const columns = Math.max(1, colEnd.length);
  return {
    allDay,
    timed: withCol.map((t) => ({ ...t, columns })),
  };
}

/** 把事件的开始/结束整体平移 deltaMin 分钟(跨天自动进位)。 */
export function shiftEventTimes(ev: AgendaEvent, deltaMin: number): { start: string; end?: string } {
  const d = parseLocalDate(ev.start);
  if (isNaN(d.getTime())) return { start: ev.start, end: ev.end };
  d.setMinutes(d.getMinutes() + deltaMin);
  const fmt = (x: Date): string => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}`;
  };
  if (!ev.end) return { start: fmt(d) };
  const de = parseLocalDate(ev.end);
  de.setMinutes(de.getMinutes() + deltaMin);
  return { start: fmt(d), end: fmt(de) };
}

/** 只平移结束时间(改时长):end = end + deltaMin,最小比 start 晚 SNAP_MIN。 */
export function shiftEventEnd(ev: AgendaEvent, deltaMin: number): { start: string; end?: string } {
  const start = ev.start;
  if (!ev.end) return { start, end: shiftEventTimes(ev, 0).end };
  const d = parseLocalDate(ev.end);
  if (isNaN(d.getTime())) return { start, end: ev.end };
  d.setMinutes(d.getMinutes() + deltaMin);
  const s = parseLocalDate(ev.start);
  const minEnd = new Date(s.getTime() + SNAP_MIN * 60_000);
  if (d.getTime() < minEnd.getTime()) d.setTime(minEnd.getTime());
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return { start, end: fmt };
}

/** 周视图拖拽:把事件的开始/结束整体平移到另一天(保留时刻)。 */
export function shiftEventToDay(ev: AgendaEvent, fromDay: Date, toDay: Date): { start: string; end?: string } {
  const deltaDays = Math.round((startOfDay(toDay).getTime() - startOfDay(fromDay).getTime()) / 86400_000);
  return shiftEventTimes(ev, deltaDays * 1440);
}

/** 全天事件跨日拖动:返回新 start/end 日期(全天语义,end 为排他日期)。 */
export function shiftAllDayEvent(ev: AgendaEvent, fromDay: Date, toDay: Date): { start: string; end?: string } {
  const deltaDays = Math.round((startOfDay(toDay).getTime() - startOfDay(fromDay).getTime()) / 86400_000);
  const shift = (iso: string): string => {
    const d = parseLocalDate(iso);
    d.setDate(d.getDate() + deltaDays);
    return toDateKey(d);
  };
  return { start: shift(ev.start), end: ev.end ? shift(ev.end) : undefined };
}

/**
 * 周视图统一可见窗口:分区范围 ∪ 整周所有 timed 事件的范围。
 * 各列共用同一窗口,高度一致,贯通时间线(06:00/12:00/18:00)才能从左到右对齐。
 */
export function weekWindowRange(
  segments: TimeSegment[],
  weekOccurrences: EventOccurrence[],
): VisibleRange {
  const base = visibleRange(segments);
  let lo = base.startMin;
  let hi = base.endMin;
  for (const occ of weekOccurrences) {
    if (occ.event.allDay) continue; // 全天事件走横条
    const s = parseLocalDate(occ.start).getTime();
    const dayStart = startOfDay(parseLocalDate(occ.start)).getTime();
    const e = occ.end ? parseLocalDate(occ.end).getTime() : undefined;
    if (e !== undefined && e < dayStart) continue;
    if (s >= dayStart + 86400_000) continue;
    const topMin = Math.round(Math.max(s - dayStart, 0) / 60_000);
    const bottomMin = e === undefined ? topMin + 30 : Math.round(Math.min(e - dayStart, 86400_000) / 60_000);
    lo = Math.min(lo, topMin);
    hi = Math.max(hi, bottomMin);
  }
  lo = Math.max(0, Math.min(lo, 1440));
  hi = Math.min(1440, Math.max(hi, lo));
  if (hi - lo < 60) return { startMin: 0, endMin: 1440 };
  return { startMin: lo, endMin: hi };
}

const DAY_MS = 86400_000;

export interface WeekSpanItem {
  /** 链上第一片(点击与配色用它)。 */
  occ: EventOccurrence;
  /** 起始列(0=周一 .. 6=周日,已按周界裁剪)。 */
  startCol: number;
  /** 结束列(含,已按周界裁剪)。 */
  endCol: number;
  /** 纵向车道(重叠的横条各占一行)。 */
  lane: number;
  /** 真实起点在本周之前(横条左端被周界截断)。 */
  continuesBefore: boolean;
  /** 真实终点在本周之后(横条右端被周界截断)。 */
  continuesAfter: boolean;
  /** 真实开始时间戳(非重复事件取事件级起点,而非周界裁剪后的片头)。 */
  startTs: number;
  /** 真实结束时间戳(全天事件为排他日期当天 0 点;无 end 时 = startTs)。 */
  endTs: number;
}

export interface WeekSpanLayout {
  spans: WeekSpanItem[];
  /** 进了横条区的 occurrence:视图据此把它们从时间格与窗口计算中剔除。 */
  consumed: Set<EventOccurrence>;
}

/**
 * 周视图顶部「贯通横条区」布局:全天事件(单日占 1 列)与跨天 timed 事件
 * 统一渲染为跨列横条,不再把多天的列填满。
 * 跨天事件被 expandOccurrences 切成每天一片,这里按「同 uid 且午夜相接/重叠」
 * 合并回完整跨度;重复事件的实例本身不切片,实例间有空隙自然不会误合并。
 * timed 事件恰好午夜 0 点结束不算跨天(-1ms 后仍落在当天)。
 */
export function layoutWeekSpans(occurrences: EventOccurrence[], weekStart: Date): WeekSpanLayout {
  const wk0 = startOfDay(weekStart).getTime();
  const dayIndex = (ts: number): number => Math.round((startOfDay(new Date(ts)).getTime() - wk0) / DAY_MS);

  // 1) 同事件(同 uid)的片按开始排序,相接/重叠的合并为一条链
  const byUid = new Map<string, EventOccurrence[]>();
  for (const o of occurrences) {
    const list = byUid.get(o.event.uid);
    if (list) list.push(o);
    else byUid.set(o.event.uid, [o]);
  }
  interface Chain {
    occs: EventOccurrence[];
    start: number;
    end: number;
  }
  const chains: Chain[] = [];
  for (const list of byUid.values()) {
    list.sort((a, b) => parseLocalDate(a.start).getTime() - parseLocalDate(b.start).getTime());
    let cur: Chain | null = null;
    for (const o of list) {
      const s = parseLocalDate(o.start).getTime();
      const e = o.end ? parseLocalDate(o.end).getTime() : s;
      if (cur && s <= cur.end) {
        cur.occs.push(o);
        cur.end = Math.max(cur.end, e);
      } else {
        cur = { occs: [o], start: s, end: e };
        chains.push(cur);
      }
    }
  }

  // 2) 链 → 横条项(全天全部进;timed 仅跨天进)
  const spans: WeekSpanItem[] = [];
  const consumed = new Set<EventOccurrence>();
  for (const c of chains) {
    const ev = c.occs[0].event;
    const hasEnd = c.end > c.start;
    // 链可能被周界裁短:非重复事件用事件级起止还原真实跨度;
    // 重复事件的 occurrence 已是实例级完整跨度,事件级 DTSTART 反而是序列起点,不能取
    const realStart = ev.rrule ? c.start : Math.min(c.start, parseLocalDate(ev.start).getTime());
    const realEnd = ev.rrule ? c.end : Math.max(c.end, ev.end ? parseLocalDate(ev.end).getTime() : c.start);
    const firstDay = startOfDay(new Date(realStart)).getTime();
    const lastDay = hasEnd ? Math.max(firstDay, startOfDay(new Date(realEnd - 1)).getTime()) : firstDay;
    if (!ev.allDay && lastDay === firstDay) continue; // 单日 timed 留在时间格
    const startCol = Math.max(0, dayIndex(firstDay));
    const endCol = Math.min(6, dayIndex(lastDay));
    if (startCol > 6 || endCol < 0) continue; // 完全在本周外(如下周的重复实例)
    for (const o of c.occs) consumed.add(o);
    spans.push({
      occ: c.occs[0],
      startCol,
      endCol,
      lane: 0,
      continuesBefore: firstDay < wk0,
      continuesAfter: dayIndex(lastDay) > 6,
      startTs: realStart,
      endTs: realEnd,
    });
  }

  // 3) 车道分配:按起始列排序,贪心放入第一条不冲突的车道
  spans.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol || a.startTs - b.startTs);
  const laneEnd: number[] = [];
  for (const s of spans) {
    let lane = laneEnd.findIndex((end) => end < s.startCol);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(-1);
    }
    laneEnd[lane] = s.endCol;
    s.lane = lane;
  }
  return { spans, consumed };
}
