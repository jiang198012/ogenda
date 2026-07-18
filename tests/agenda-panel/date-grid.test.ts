import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { EventOccurrence } from "../../src/agenda-panel/occurrences";
import { toDateKey, startOfDay, addDays, startOfWeek, monthGridWeeks, groupByDay } from "../../src/agenda-panel/date-grid";

describe("date-grid", () => {
  it("toDateKey formats as YYYY-MM-DD", () => {
    expect(toDateKey(new Date(2026, 6, 6))).toBe("2026-07-06");
  });

  it("startOfDay strips the time component", () => {
    expect(startOfDay(new Date(2026, 6, 18, 15, 30))).toEqual(new Date(2026, 6, 18));
  });

  it("addDays shifts by N days, including across month boundaries", () => {
    expect(addDays(new Date(2026, 6, 30), 3)).toEqual(new Date(2026, 7, 2));
  });

  it("startOfWeek returns the Monday of the week containing the date", () => {
    // 2026-07-18 is a Saturday
    expect(startOfWeek(new Date(2026, 6, 18))).toEqual(new Date(2026, 6, 13));
  });

  it("startOfWeek is a no-op when the date is already a Monday", () => {
    // 2026-07-13 is a Monday
    expect(startOfWeek(new Date(2026, 6, 13))).toEqual(new Date(2026, 6, 13));
  });

  it("monthGridWeeks builds a Monday-first grid covering July 2026 with padding days", () => {
    const weeks = monthGridWeeks(new Date(2026, 6, 15)); // any date in July
    expect(weeks.length).toBe(5);
    expect(weeks[0][0]).toEqual(new Date(2026, 5, 29)); // Mon, from June
    expect(weeks[0][2]).toEqual(new Date(2026, 6, 1));  // Wed, first of July
    expect(weeks[4][4]).toEqual(new Date(2026, 6, 31)); // Fri, last of July
    expect(weeks[4][6]).toEqual(new Date(2026, 7, 2));  // Sun, into August
  });

  it("groupByDay groups occurrences by calendar day and sorts groups ascending", () => {
    const ev = (uid: string): AgendaEvent => ({ uid, title: "t", start: "x", origin: "synced" });
    const occs: EventOccurrence[] = [
      { event: ev("b"), start: "2026-07-20T09:00:00" },
      { event: ev("a"), start: "2026-07-18T09:00:00" },
      { event: ev("c"), start: "2026-07-18T14:00:00" },
    ];
    const groups = groupByDay(occs);
    expect(groups.length).toBe(2);
    expect(groups[0].date).toEqual(new Date(2026, 6, 18));
    expect(groups[0].items.map((o) => o.event.uid)).toEqual(["a", "c"]);
    expect(groups[1].date).toEqual(new Date(2026, 6, 20));
  });

  it("groupByDay groups an all-day occurrence under its own date-only day, in a timezone west of UTC", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const ev: AgendaEvent = { uid: "a", title: "t", start: "2026-07-13", allDay: true, origin: "synced" };
      const occs: EventOccurrence[] = [{ event: ev, start: "2026-07-13" }];
      const groups = groupByDay(occs);
      expect(groups.length).toBe(1);
      expect(groups[0].date).toEqual(new Date(2026, 6, 13));
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});
