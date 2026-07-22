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

  it("uses start+1 day as DTEND when an all-day event's explicit end equals its start", () => {
    const ics = eventToVCalendar(base({ start: "2026-07-21", end: "2026-07-21", allDay: true }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260721");
    expect(ics).toContain("DTEND;VALUE=DATE:20260722");
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

describe("eventToVCalendar — extended push fields", () => {
  it("emits DESCRIPTION with escaping (newline/semicolon/comma/backslash)", () => {
    const ics = eventToVCalendar(base({ description: "第一行\n第二行;含,标点\\尾" }));
    expect(ics).toContain("DESCRIPTION:第一行\\n第二行\\;含\\,标点\\\\尾");
    expect(icalToEvents(ics, "test")[0].description).toBe("第一行\n第二行;含,标点\\尾");
  });

  it("emits ORGANIZER/ATTENDEE with exactly one mailto: prefix even if the value already has one", () => {
    const ics = eventToVCalendar(
      base({ organizer: "mailto:alice@example.com", attendees: ["bob@example.com", "mailto:carol@example.com"] }),
    );
    expect(ics).toContain("ORGANIZER:mailto:alice@example.com");
    expect(ics).not.toContain("mailto:mailto:");
    expect(ics).toContain("ATTENDEE:mailto:bob@example.com");
    expect(ics).toContain("ATTENDEE:mailto:carol@example.com");
  });

  it("emits STATUS uppercased; model stays lowercase", () => {
    const ics = eventToVCalendar(base({ status: "tentative" }));
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(icalToEvents(ics, "test")[0].status).toBe("tentative");
  });

  it("emits CATEGORIES escaped (a comma stays a single value)", () => {
    const ics = eventToVCalendar(base({ category: "a, b" }));
    expect(ics).toContain("CATEGORIES:a\\, b");
    expect(icalToEvents(ics, "test")[0].category).toBe("a, b");
  });

  it("emits RRULE raw (no TEXT escaping; BYDAY keeps its comma)", () => {
    const ics = eventToVCalendar(base({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" }));
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(icalToEvents(ics, "test")[0].rrule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  });

  it("omits every extended field when unset (byte-compatible with the pre-extension output)", () => {
    const ics = eventToVCalendar(base({}));
    for (const k of ["DESCRIPTION", "ORGANIZER", "ATTENDEE", "STATUS", "CATEGORIES", "RRULE"]) {
      expect(ics).not.toContain(k);
    }
  });

  it("full round-trip: every synced field survives eventToVCalendar → icalToEvents", () => {
    const ev = base({
      end: "2026-07-14T08:00:00Z",
      location: "会议室A",
      description: "备注\n第二行",
      organizer: "alice@example.com",
      attendees: ["bob@example.com", "carol@example.com"],
      status: "confirmed",
      category: "工作",
      rrule: "FREQ=DAILY;COUNT=3",
    });
    const back = icalToEvents(eventToVCalendar(ev), "test")[0];
    expect(back.title).toBe(ev.title);
    expect(back.start).toContain("2026-07-14T07:00:00");
    expect(back.end).toContain("2026-07-14T08:00:00");
    expect(back.location).toBe(ev.location);
    expect(back.description).toBe(ev.description);
    expect(back.organizer).toBe(ev.organizer);
    expect(back.attendees).toEqual(ev.attendees);
    expect(back.status).toBe(ev.status);
    expect(back.category).toBe(ev.category);
    expect(back.rrule).toBe(ev.rrule);
  });
});
