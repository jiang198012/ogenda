import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { eventToVCalendar, minutesToIsoDuration, isoDurationToMinutes } from "../../src/core/ical-gen";
import { icalToEvents } from "../../src/core/ical-map";

const base = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1@x",
  title: "会议",
  start: "2026-07-14T07:00:00Z",
  origin: "synced",
  ...o,
});

describe("minutesToIsoDuration / isoDurationToMinutes", () => {
  it("converts minutes to ISO durations and back", () => {
    expect(minutesToIsoDuration(15)).toBe("-PT15M");
    expect(minutesToIsoDuration(0)).toBe("PT0S");
    expect(minutesToIsoDuration(60)).toBe("-PT1H");
    expect(minutesToIsoDuration(1440)).toBe("-P1D");
    expect(minutesToIsoDuration(1500)).toBe("-P1DT1H");
    expect(isoDurationToMinutes("-PT15M")).toBe(-15);
    expect(isoDurationToMinutes("-P1D")).toBe(-1440);
    expect(isoDurationToMinutes("PT0S")).toBe(0);
    expect(isoDurationToMinutes("-PT1H30M")).toBe(-90);
    expect(isoDurationToMinutes("garbage")).toBeNull();
  });
});

describe("eventToVCalendar — VALARM", () => {
  it("emits a relative VALARM before the event start", () => {
    const ics = eventToVCalendar(base({ reminder: 15 }));
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("DESCRIPTION:会议");
    expect(ics).toContain("END:VALARM");
  });

  it("emits TRIGGER:PT0S for an at-start reminder", () => {
    expect(eventToVCalendar(base({ reminder: 0 }))).toContain("TRIGGER:PT0S");
  });

  it("emits a day-based trigger for 1-day reminders", () => {
    expect(eventToVCalendar(base({ reminder: 1440 }))).toContain("TRIGGER:-P1D");
  });

  it("emits one VALARM for every reminder in the array", () => {
    const ics = eventToVCalendar(base({ reminders: [1440, 60] }));
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(2);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT1H");
  });

  it("omits VALARM when no reminder is set (byte-compatible output)", () => {
    expect(eventToVCalendar(base({}))).not.toContain("VALARM");
  });
});

describe("icalToEvents — VALARM parsing", () => {
  it("round-trips a reminder as minutes before start", () => {
    const back = icalToEvents(eventToVCalendar(base({ start: "2026-07-14T07:00:00Z", reminder: 30 })), "test")[0];
    expect(back.reminder).toBe(30);
  });

  it("parses an at-start reminder as 0", () => {
    const back = icalToEvents(eventToVCalendar(base({ reminder: 0 })), "test")[0];
    expect(back.reminder).toBe(0);
  });

  it("parses all DISPLAY VALARM components", () => {
    const back = icalToEvents(eventToVCalendar(base({ reminders: [1440, 60] })), "test")[0];
    expect(back.reminders).toEqual([1440, 60]);
    expect(back.reminder).toBe(1440); // legacy alias remains readable
  });

  it("leaves reminder undefined when there is no VALARM", () => {
    const back = icalToEvents(eventToVCalendar(base({})), "test")[0];
    expect(back.reminder).toBeUndefined();
  });
});

describe("eventToVCalendar / icalToEvents — EXDATE", () => {
  it("emits EXDATE for timed events in compact form", () => {
    const ics = eventToVCalendar(base({ exdates: ["2026-07-21T07:00:00", "2026-07-28T07:00:00"] }));
    expect(ics).toContain("EXDATE:20260721T070000,20260728T070000");
  });

  it("emits EXDATE;VALUE=DATE for all-day events", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-20", allDay: true, exdates: ["2026-07-27"] }));
    expect(ics).toContain("EXDATE;VALUE=DATE:20260727");
  });

  it("round-trips exdates through icalToEvents", () => {
    const ev = base({ exdates: ["2026-07-21T07:00:00"] });
    const back = icalToEvents(eventToVCalendar(ev), "test")[0];
    expect(back.exdates).toContain("2026-07-21T07:00:00");
  });
});
