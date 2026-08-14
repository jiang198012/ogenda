import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { expandOccurrences, EventOccurrence } from "../../src/agenda-panel/occurrences";
import {
  layoutDayGrid,
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
