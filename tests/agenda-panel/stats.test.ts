import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { LocalEvent } from "../../src/store/monthly-store";
import { computeStats } from "../../src/agenda-panel/stats";

const ev = (o: Partial<AgendaEvent> = {}): AgendaEvent => ({
  uid: "x", title: "t", start: "2026-07-10T09:00:00", origin: "synced", ...o,
});

describe("computeStats", () => {
  it("counts only events whose start falls in the anchor's calendar month", () => {
    const events = [ev({ uid: "a", start: "2026-07-10T09:00:00" }), ev({ uid: "b", start: "2026-08-01T09:00:00" })];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.total).toBe(1);
  });

  it("buckets by status, defaulting missing status to '未设置'", () => {
    const events = [
      ev({ uid: "a", status: "confirmed" }),
      ev({ uid: "b", status: "confirmed" }),
      ev({ uid: "c", status: "tentative" }),
      ev({ uid: "d" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.byStatus).toEqual({ confirmed: 2, tentative: 1, "未设置": 1 });
  });

  it("counts all-day vs timed, and recurring vs one-off", () => {
    const events = [
      ev({ uid: "a", allDay: true, start: "2026-07-05" }),
      ev({ uid: "b", allDay: false }),
      ev({ uid: "c", rrule: "FREQ=WEEKLY" }),
      ev({ uid: "d" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.allDayCount).toBe(1);
    expect(stats.timedCount).toBe(3);
    expect(stats.recurringCount).toBe(1);
    expect(stats.onceCount).toBe(3);
  });

  it("buckets by category, defaulting missing category to '未分类'", () => {
    const events = [ev({ uid: "a", category: "工作" }), ev({ uid: "b", category: "工作" }), ev({ uid: "c" })];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.byCategory).toEqual({ "工作": 2, "未分类": 1 });
  });

  it("ranks the top 3 busiest days descending by event count", () => {
    const events = [
      ev({ uid: "a", start: "2026-07-06T09:00:00" }),
      ev({ uid: "b", start: "2026-07-06T14:00:00" }),
      ev({ uid: "c", start: "2026-07-06T18:00:00" }),
      ev({ uid: "d", start: "2026-07-10T09:00:00" }),
      ev({ uid: "e", start: "2026-07-10T14:00:00" }),
      ev({ uid: "f", start: "2026-07-20T09:00:00" }),
      ev({ uid: "g", start: "2026-07-21T09:00:00" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.busiestDays).toEqual([
      { date: "2026-07-06", count: 3 },
      { date: "2026-07-10", count: 2 },
      { date: "2026-07-20", count: 1 },
    ]);
  });

  it("counts local events with no href, or a hash mismatch vs base_hash, as unsynced -- scoped to the anchor month", () => {
    const local: LocalEvent[] = [
      { uid: "a", hasHref: false, prose: "", fields: { uid: "a", title: "新建的", start: "2026-07-08T09:00:00" } },
      {
        uid: "b", hasHref: true, prose: "",
        fields: { uid: "b", title: "改过的", start: "2026-07-09T09:00:00", href: "https://x/b.ics", base_hash: "stale" },
      },
      {
        uid: "c", hasHref: true, prose: "",
        fields: { uid: "c", title: "没改过", start: "2026-07-11T09:00:00", href: "https://x/c.ics", base_hash: "68247118" },
      },
      { uid: "d", hasHref: false, prose: "", fields: { uid: "d", title: "别的月", start: "2026-08-01T09:00:00" } },
    ];
    // "没改过" gets a real base_hash equal to its own current hash, so it does NOT count as unsynced.
    const stats1 = computeStats([], local, new Date(2026, 6, 15));
    expect(stats1.unsyncedCount).toBe(2); // a (no href) + b (hash mismatch); d is filtered out (wrong month)
  });

  it("keys off the anchor date's own month even when the 1st isn't a Monday (guards the stats-tab month-off-by-one)", () => {
    // 2026-07 starts on a Wednesday, so the month grid's first cell is Mon 2026-06-29 (previous month).
    // The stats tab must anchor on a date INSIDE the shown month (this.anchor), never the grid's first
    // cell, or it silently reports June while the panel shows July.
    const july = [ev({ uid: "j", start: "2026-07-01T09:00:00" })];
    expect(computeStats(july, [], new Date(2026, 6, 1)).total).toBe(1); // anchor inside July -> July
    expect(computeStats(july, [], new Date(2026, 5, 29)).total).toBe(0); // grid first cell -> June (wrong month)
  });
});
