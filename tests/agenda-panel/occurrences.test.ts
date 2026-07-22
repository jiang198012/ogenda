import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { expandOccurrences } from "../../src/agenda-panel/occurrences";

const mk = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1", title: "会议", start: "2026-07-06T14:00:00", origin: "synced", ...o,
});

describe("expandOccurrences", () => {
  it("passes a non-recurring event through unchanged when inside the range", () => {
    const ev = mk({ end: "2026-07-06T15:00:00" });
    const out = expandOccurrences([ev], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out).toEqual([{ event: ev, start: "2026-07-06T14:00:00", end: "2026-07-06T15:00:00" }]);
  });

  it("drops a non-recurring event outside the range", () => {
    const ev = mk({ start: "2026-08-01T09:00:00" });
    const out = expandOccurrences([ev], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out).toEqual([]);
  });

  it("expands a weekly recurring event into each occurrence within the range", () => {
    const ev = mk({ end: "2026-07-06T15:00:00", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    const out = expandOccurrences([ev], new Date("2026-07-13"), new Date("2026-07-28"));
    expect(out).toEqual([
      { event: ev, start: "2026-07-13T14:00:00", end: "2026-07-13T15:00:00" },
      { event: ev, start: "2026-07-20T14:00:00", end: "2026-07-20T15:00:00" },
      { event: ev, start: "2026-07-27T14:00:00", end: "2026-07-27T15:00:00" },
    ]);
  });

  it("expands an all-day recurring event using date-only occurrence strings", () => {
    const ev = mk({ start: "2026-07-01", allDay: true, rrule: "FREQ=MONTHLY;COUNT=3" });
    const out = expandOccurrences([ev], new Date("2026-06-01"), new Date("2026-10-01"));
    expect(out.map((o) => o.start)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  it("handles a recurring event that started years before the visible range", () => {
    const ev = mk({ start: "2019-01-01T09:00:00", end: "2019-01-01T09:30:00", rrule: "FREQ=DAILY" });
    const out = expandOccurrences([ev], new Date("2026-07-13"), new Date("2026-07-20"));
    expect(out.length).toBe(7);
    expect(out[0].start).toBe("2026-07-13T09:00:00");
  });

  it("sorts all occurrences (across multiple events) by start ascending", () => {
    const a = mk({ uid: "a", start: "2026-07-10T09:00:00" });
    const b = mk({ uid: "b", start: "2026-07-05T09:00:00" });
    const out = expandOccurrences([a, b], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out.map((o) => o.event.uid)).toEqual(["b", "a"]);
  });

  it("includes an all-day non-recurring event on its own day, in a timezone west of UTC", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const ev = mk({ start: "2026-07-13", allDay: true });
      const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 14));
      expect(out).toEqual([{ event: ev, start: "2026-07-13", end: undefined }]);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("expands a same-day all-day event with explicit end equal to start", () => {
    const ev = mk({ start: "2026-07-13", end: "2026-07-13", allDay: true });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 14));
    expect(out).toEqual([{ event: ev, start: "2026-07-13", end: "2026-07-13" }]);
  });

  it("expands a multi-day all-day event across each day it spans", () => {
    const ev = mk({ start: "2026-07-13", end: "2026-07-15", allDay: true });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 16));
    expect(out.map((o) => ({ start: o.start, end: o.end }))).toEqual([
      { start: "2026-07-13", end: "2026-07-14" },
      { start: "2026-07-14", end: "2026-07-15" },
    ]);
  });

  it("expands a timed event across midnight into each calendar day", () => {
    const ev = mk({ start: "2026-07-13T22:00:00", end: "2026-07-14T10:00:00" });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 15));
    expect(out.map((o) => ({ start: o.start, end: o.end }))).toEqual([
      { start: "2026-07-13T22:00:00", end: "2026-07-14T00:00:00" },
      { start: "2026-07-14T00:00:00", end: "2026-07-14T10:00:00" },
    ]);
  });

  it("clips a multi-day event to the requested range", () => {
    const ev = mk({ start: "2026-07-12T22:00:00", end: "2026-07-15T10:00:00" });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 14));
    expect(out.map((o) => o.start)).toEqual(["2026-07-13T00:00:00"]);
  });
});
