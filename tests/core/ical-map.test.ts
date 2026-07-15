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
  });
});
