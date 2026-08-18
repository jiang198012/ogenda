import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { expandOccurrences, EventOccurrence } from "../../src/agenda-panel/occurrences";
import {
  layoutDayGrid,
  layoutWeekSpans,
  isoToMinutes,
  minutesToIso,
  snapMinutes,
  shiftEventTimes,
  shiftEventEnd,
  shiftEventToDay,
  shiftAllDayEvent,
} from "../../src/agenda-panel/day-grid";

const occ = (o: Partial<AgendaEvent>, start = "2026-07-14T10:00:00", end?: string | null): EventOccurrence => ({
  event: {
    uid: "e1", title: "会议", start, end: end === null ? undefined : (end ?? "2026-07-14T11:00:00"), origin: "local", ...o,
  },
  start,
  end: end === null ? undefined : (end ?? "2026-07-14T11:00:00"),
});

const DAY = new Date(2026, 6, 14); // 周二

describe("layoutDayGrid", () => {
  it("separates all-day events into the strip", () => {
    const layout = layoutDayGrid(
      [occ({ allDay: true }, "2026-07-14", "2026-07-15"), occ({}, "2026-07-14T09:00:00", "2026-07-14T10:00:00")],
      DAY,
    );
    expect(layout.allDay).toHaveLength(1);
    expect(layout.timed).toHaveLength(1);
  });

  it("maps minutes for a timed event", () => {
    const layout = layoutDayGrid([occ({}, "2026-07-14T09:30:00", "2026-07-14T11:15:00")], DAY);
    expect(layout.timed[0].topMin).toBe(570);
    expect(layout.timed[0].bottomMin).toBe(675);
  });

  it("clips an event spanning into the next day to 24:00", () => {
    const layout = layoutDayGrid([occ({}, "2026-07-14T23:00:00", "2026-07-15T02:00:00")], DAY);
    expect(layout.timed[0].topMin).toBe(23 * 60);
    expect(layout.timed[0].bottomMin).toBe(1440);
  });

  it("clips an event starting the previous day to 00:00", () => {
    const layout = layoutDayGrid([occ({}, "2026-07-13T22:00:00", "2026-07-14T03:00:00")], DAY);
    expect(layout.timed[0].topMin).toBe(0);
    expect(layout.timed[0].bottomMin).toBe(3 * 60);
  });

  it("gives a no-end event a minimum visible height", () => {
    const layout = layoutDayGrid([occ({ end: undefined }, "2026-07-14T10:00:00", null)], DAY);
    expect(layout.timed[0].bottomMin).toBe(10 * 60 + 30);
  });

  it("assigns overlap columns and keeps non-overlapping events side by side", () => {
    const a = occ({ uid: "a" }, "2026-07-14T09:00:00", "2026-07-14T10:30:00");
    const b = occ({ uid: "b" }, "2026-07-14T09:30:00", "2026-07-14T10:00:00");
    const c = occ({ uid: "c" }, "2026-07-14T10:00:00", "2026-07-14T11:00:00");
    const layout = layoutDayGrid([a, b, c], DAY);
    const byUid = Object.fromEntries(layout.timed.map((t) => [t.occ.event.uid, t]));
    expect(byUid.a.column).not.toBe(byUid.b.column); // 重叠 → 分列
    expect(byUid.c.column).toBe(byUid.b.column); // b 先结束 → c 复用 b 的列
    expect(layout.timed.every((t) => t.columns === 2)).toBe(true);
  });

  it("drops events entirely outside the day", () => {
    const before = occ({}, "2026-07-13T22:00:00", "2026-07-13T23:00:00");
    const after = occ({}, "2026-07-15T00:00:00", "2026-07-15T01:00:00");
    const layout = layoutDayGrid([before, after], DAY);
    expect(layout.timed).toHaveLength(0);
  });
});

describe("time conversion helpers", () => {
  it("isoToMinutes / minutesToIso round-trip", () => {
    expect(isoToMinutes("2026-07-14T14:23:00", DAY)).toBe(14 * 60 + 23);
    expect(minutesToIso(DAY, 14 * 60 + 23)).toBe("2026-07-14T14:23:00");
  });

  it("minutesToIso rolls across midnight", () => {
    expect(minutesToIso(DAY, 1440 + 30)).toBe("2026-07-15T00:30:00");
    expect(minutesToIso(DAY, -30)).toBe("2026-07-13T23:30:00");
  });

  it("snapMinutes snaps to 15-minute steps and clamps to the day", () => {
    expect(snapMinutes(62)).toBe(60);
    expect(snapMinutes(1439)).toBe(1425);
    expect(snapMinutes(-5)).toBe(0);
  });
});

describe("shiftEventTimes / shiftEventEnd", () => {
  it("shifts both start and end", () => {
    const ev: AgendaEvent = occ({}).event;
    expect(shiftEventTimes(ev, 30)).toEqual({ start: "2026-07-14T10:30:00", end: "2026-07-14T11:30:00" });
  });

  it("shifts across midnight", () => {
    const ev: AgendaEvent = occ({}, "2026-07-14T23:00:00", "2026-07-15T01:00:00").event;
    expect(shiftEventTimes(ev, 60)).toEqual({ start: "2026-07-15T00:00:00", end: "2026-07-15T02:00:00" });
  });

  it("keeps a missing end missing", () => {
    const ev: AgendaEvent = occ({ end: undefined }, "2026-07-14T10:00:00").event;
    expect(shiftEventTimes(ev, 120)).toEqual({ start: "2026-07-14T12:00:00", end: undefined });
  });

  it("resize only moves the end, never before start + 15 min", () => {
    const ev: AgendaEvent = occ({}, "2026-07-14T10:00:00", "2026-07-14T11:00:00").event;
    expect(shiftEventEnd(ev, 30)).toEqual({ start: "2026-07-14T10:00:00", end: "2026-07-14T11:30:00" });
    expect(shiftEventEnd(ev, -120)).toEqual({ start: "2026-07-14T10:00:00", end: "2026-07-14T10:15:00" });
  });

  it("shiftEventToDay moves the whole event to another day, keeping the time", () => {
    const ev: AgendaEvent = occ({}).event;
    const to = new Date(2026, 6, 16);
    expect(shiftEventToDay(ev, DAY, to)).toEqual({ start: "2026-07-16T10:00:00", end: "2026-07-16T11:00:00" });
  });

  it("shiftAllDayEvent moves date-only values", () => {
    const ev: AgendaEvent = occ({ allDay: true, end: "2026-07-15" }, "2026-07-14").event;
    const to = new Date(2026, 6, 17);
    expect(shiftAllDayEvent(ev, DAY, to)).toEqual({ start: "2026-07-17", end: "2026-07-18" });
  });
});

describe("layoutDayGrid with a recurring expansion", () => {
  it("lays out expanded occurrences like plain events", () => {
    const ev: AgendaEvent = {
      uid: "r1", title: "站会", start: "2026-07-14T09:00:00", end: "2026-07-14T09:15:00", origin: "local",
      rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
    };
    const occs = expandOccurrences([ev], DAY, new Date(2026, 6, 15));
    expect(occs).toHaveLength(1);
    const layout = layoutDayGrid(occs, DAY);
    expect(layout.timed[0].topMin).toBe(540);
    // 15 分钟事件按最小可见高度(30 分钟)展示,便于抓取
    expect(layout.timed[0].bottomMin).toBe(570);
  });
});

describe("layoutWeekSpans", () => {
  // 2026-07-13 是周一;周范围 [07-13, 07-20)
  const WK = new Date(2026, 6, 13);
  const WEEK_END = new Date(2026, 6, 20);
  const expand = (ev: AgendaEvent, from = WK, to = WEEK_END) => expandOccurrences([ev], from, to);

  it("merges a clipped multi-day timed event into one span and consumes its pieces", () => {
    const ev: AgendaEvent = { uid: "trip", title: "出差", start: "2026-07-13T09:00:00", end: "2026-07-15T17:00:00", origin: "local" };
    const occs = expand(ev);
    expect(occs.length).toBe(3); // 被切成 Mon/Tue/Wed 三片
    const layout = layoutWeekSpans(occs, WK);
    expect(layout.spans).toHaveLength(1);
    expect(layout.spans[0].startCol).toBe(0);
    expect(layout.spans[0].endCol).toBe(2);
    expect(layout.spans[0].continuesBefore).toBe(false);
    expect(layout.spans[0].continuesAfter).toBe(false);
    expect(layout.consumed.size).toBe(3);
  });

  it("routes a cross-midnight event to the span bar", () => {
    const ev: AgendaEvent = { uid: "night", title: "夜班", start: "2026-07-13T22:00:00", end: "2026-07-14T01:00:00", origin: "local" };
    const layout = layoutWeekSpans(expand(ev), WK);
    expect(layout.spans).toHaveLength(1);
    expect(layout.spans[0].startCol).toBe(0);
    expect(layout.spans[0].endCol).toBe(1);
  });

  it("keeps an event ending exactly at midnight in the time grid", () => {
    const ev: AgendaEvent = { uid: "late", title: "加班", start: "2026-07-13T22:00:00", end: "2026-07-14T00:00:00", origin: "local" };
    const layout = layoutWeekSpans(expand(ev), WK);
    expect(layout.spans).toHaveLength(0);
    expect(layout.consumed.size).toBe(0);
  });

  it("keeps single-day timed events out of the span bar", () => {
    const ev: AgendaEvent = { uid: "meet", title: "例会", start: "2026-07-14T10:00:00", end: "2026-07-14T11:00:00", origin: "local" };
    const layout = layoutWeekSpans(expand(ev), WK);
    expect(layout.spans).toHaveLength(0);
  });

  it("spans a multi-day all-day event across start..end (exclusive)", () => {
    const ev: AgendaEvent = { uid: "ab", title: "闭关", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "local" };
    const layout = layoutWeekSpans(expand(ev), WK);
    expect(layout.spans).toHaveLength(1);
    expect(layout.spans[0].startCol).toBe(0);
    expect(layout.spans[0].endCol).toBe(1); // 07-15 排他,最后覆盖 07-14
  });

  it("puts a single-day all-day event in a one-column span", () => {
    const ev: AgendaEvent = { uid: "bd", title: "生日", start: "2026-07-14", allDay: true, origin: "local" };
    const layout = layoutWeekSpans(expand(ev), WK);
    expect(layout.spans).toHaveLength(1);
    expect(layout.spans[0].startCol).toBe(1);
    expect(layout.spans[0].endCol).toBe(1);
  });

  it("stacks overlapping spans into separate lanes and reuses lanes when disjoint", () => {
    const a: AgendaEvent = { uid: "a", title: "A", start: "2026-07-13T09:00:00", end: "2026-07-15T18:00:00", origin: "local" }; // Mon–Wed
    const b: AgendaEvent = { uid: "b", title: "B", start: "2026-07-14T09:00:00", end: "2026-07-16T18:00:00", origin: "local" }; // Tue–Thu
    const c: AgendaEvent = { uid: "c", title: "C", start: "2026-07-16T09:00:00", end: "2026-07-17T18:00:00", origin: "local" }; // Thu–Fri
    const layout = layoutWeekSpans(expandOccurrences([a, b, c], WK, WEEK_END), WK);
    const byUid = Object.fromEntries(layout.spans.map((s) => [s.occ.event.uid, s]));
    expect(byUid.a.lane).toBe(0);
    expect(byUid.b.lane).toBe(1);
    expect(byUid.c.lane).toBe(0); // 与 a 不重叠 → 复用 lane 0
  });

  it("clamps to the week and marks continuation past the edges", () => {
    const before: AgendaEvent = { uid: "pre", title: "上周来", start: "2026-07-12T10:00:00", end: "2026-07-14T17:00:00", origin: "local" };
    const after: AgendaEvent = { uid: "post", title: "到下周", start: "2026-07-18T09:00:00", end: "2026-07-20T12:00:00", origin: "local" };
    const layout = layoutWeekSpans(expandOccurrences([before, after], WK, WEEK_END), WK);
    const byUid = Object.fromEntries(layout.spans.map((s) => [s.occ.event.uid, s]));
    expect(byUid.pre.startCol).toBe(0);
    expect(byUid.pre.endCol).toBe(1);
    expect(byUid.pre.continuesBefore).toBe(true);
    expect(byUid.pre.continuesAfter).toBe(false);
    expect(byUid.post.startCol).toBe(5);
    expect(byUid.post.endCol).toBe(6);
    expect(byUid.post.continuesAfter).toBe(true);
  });

  it("routes an unclipped recurring multi-day instance to the span bar without merging instances", () => {
    const ev: AgendaEvent = {
      uid: "rw", title: "双周冲刺", start: "2026-07-13T09:00:00", end: "2026-07-15T17:00:00", origin: "local",
      rrule: "FREQ=WEEKLY",
    };
    const occs = expandOccurrences([ev], WK, new Date(2026, 6, 27)); // 两个实例:07-13 与 07-20 起
    expect(occs).toHaveLength(2);
    const layout = layoutWeekSpans(occs, WK);
    // 第二个实例完全在下周,不参与本周横条;两个实例绝不能合并成一条
    expect(layout.spans).toHaveLength(1);
    expect(layout.spans[0].startCol).toBe(0);
    expect(layout.spans[0].endCol).toBe(2);
  });
});
