import { describe, it, expect } from "vitest";
import { icalToEvents } from "../../src/core/ical-map";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:evt-1@example.com
SUMMARY:团队周会
DTSTART:20260714T070000Z
DTEND:20260714T080000Z
LOCATION:会议室A
ORGANIZER:mailto:alice@example.com
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

describe("icalToEvents", () => {
  it("maps a VEVENT to an AgendaEvent", () => {
    const evs = icalToEvents(ICS, "imap/gmail");
    expect(evs.length).toBe(1);
    const e = evs[0];
    expect(e.uid).toBe("evt-1@example.com");
    expect(e.title).toBe("团队周会");
    expect(e.start).toContain("2026-07-14T");
    expect(e.location).toBe("会议室A");
    expect(e.origin).toBe("synced");
    expect(e.source).toBe("imap/gmail");
    expect(e.protocol).toBe("imap");
    expect(e.organizer).toBe("alice@example.com");
    expect(e.status).toBe("confirmed");
  });

  it("maps RRULE to its string form (not [object Object])", () => {
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\nBEGIN:VEVENT\nUID:r1@x\nSUMMARY:周会\nDTSTART:20260714T070000Z\nRRULE:FREQ=WEEKLY;COUNT=5\nEND:VEVENT\nEND:VCALENDAR`;
    const e = icalToEvents(ics, "imap/gmail")[0];
    expect(e.rrule).toContain("FREQ=WEEKLY");
    expect(e.rrule).not.toContain("[object Object]");
  });

  it("strips mailto from attendees; undefined when none", () => {
    const withAtt = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\nBEGIN:VEVENT\nUID:a1@x\nSUMMARY:会\nDTSTART:20260714T070000Z\nATTENDEE:mailto:bob@example.com\nATTENDEE:mailto:carol@example.com\nEND:VEVENT\nEND:VCALENDAR`;
    const e = icalToEvents(withAtt, "s")[0];
    expect(e.attendees).toEqual(["bob@example.com", "carol@example.com"]);
    const noAtt = withAtt.replace(/ATTENDEE:[^\n]*\n/g, "");
    expect(icalToEvents(noAtt, "s")[0].attendees).toBeUndefined();
  });

  it("detects all-day events (VALUE=DATE)", () => {
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\nBEGIN:VEVENT\nUID:d1@x\nSUMMARY:全天\nDTSTART;VALUE=DATE:20260714\nEND:VEVENT\nEND:VCALENDAR`;
    const e = icalToEvents(ics, "s")[0];
    expect(e.allDay).toBe(true);
  });

  it("maps all VEVENTs in a calendar", () => {
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\nBEGIN:VEVENT\nUID:m1@x\nSUMMARY:一\nDTSTART:20260714T070000Z\nEND:VEVENT\nBEGIN:VEVENT\nUID:m2@x\nSUMMARY:二\nDTSTART:20260715T070000Z\nEND:VEVENT\nEND:VCALENDAR`;
    expect(icalToEvents(ics, "s").length).toBe(2);
  });
});
