import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { eventToVCalendar } from "../../src/core/ical-gen";
import { icalToEvents } from "../../src/core/ical-map";

const base = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1@x",
  title: "会议",
  start: "2026-07-14T07:00:00Z",
  origin: "synced",
  ...o,
});

describe("eventToVCalendar", () => {
  it("round-trips a UTC timed event through icalToEvents", () => {
    const ev = base({ end: "2026-07-14T08:00:00Z", location: "会议室A" });
    const back = icalToEvents(eventToVCalendar(ev), "test")[0];
    expect(back.uid).toBe("e1@x");
    expect(back.title).toBe("会议");
    expect(back.start).toContain("2026-07-14T07:00:00");
    expect(back.location).toBe("会议室A");
  });

  it("round-trips an all-day event", () => {
    const back = icalToEvents(eventToVCalendar(base({ start: "2026-07-20", allDay: true })), "test")[0];
    expect(back.allDay).toBe(true);
    expect(back.start).toContain("2026-07-20");
  });

  it("emits TZID for a zoned event and escapes special chars", () => {
    const ics = eventToVCalendar(base({ start: "2019-07-12T18:00:00", tz: "Asia/Shanghai", title: "a;b,c" }));
    expect(ics).toContain("DTSTART;TZID=Asia/Shanghai:20190712T180000");
    expect(ics).toContain("SUMMARY:a\\;b\\,c");
  });

  it("emits an explicit DTEND;VALUE=DATE for an all-day event with no end set, defaulting to start+1 day", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-21", allDay: true }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260721");
    expect(ics).toContain("DTEND;VALUE=DATE:20260722");
  });

  it("rolls the default all-day DTEND over a month/year boundary", () => {
    const ics = eventToVCalendar(base({ start: "2026-12-31", allDay: true }));
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("uses the explicit end date for an all-day event when one is set", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-21", end: "2026-07-23", allDay: true }));
    expect(ics).toContain("DTEND;VALUE=DATE:20260723");
  });

  it("tolerates a lowercase 't' date/time separator (common typo) for an all-day event", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-19t14:00:00", allDay: true }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260719");
    expect(ics).toContain("DTEND;VALUE=DATE:20260720");
    expect(ics).not.toContain("NaN");
  });

  it("tolerates a lowercase 't' date/time separator for a timed event", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-19t14:00:00" }));
    expect(ics).toContain("DTSTART:20260719T140000");
  });
});
