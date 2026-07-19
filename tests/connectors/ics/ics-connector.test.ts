import { describe, it, expect } from "vitest";
import { IcsConnector, normalizeIcsUrl } from "../../../src/connectors/ics/ics-connector";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1@ics
SUMMARY:订阅事件
DTSTART:20260720T090000
DTEND:20260720T100000
END:VEVENT
END:VCALENDAR`;

describe("normalizeIcsUrl", () => {
  it("webcal:// -> https://", () => {
    expect(normalizeIcsUrl("webcal://host/x.ics")).toBe("https://host/x.ics");
  });
  it("https stays, trims", () => {
    expect(normalizeIcsUrl("  https://host/x.ics ")).toBe("https://host/x.ics");
  });
});

describe("IcsConnector.fetch", () => {
  it("GETs the URL and parses VEVENTs into AgendaEvents", async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      return { status: 200, text: SAMPLE };
    };
    const c = new IcsConnector("webcal://host/x.ics", fake);
    const events = await c.fetch();
    expect(calls).toEqual(["https://host/x.ics"]); // normalized
    expect(events.length).toBe(1);
    expect(events[0].uid).toBe("evt-1@ics");
    expect(events[0].title).toBe("订阅事件");
  });
  it("throws on non-2xx", async () => {
    const fake = async () => ({ status: 404, text: "" });
    await expect(new IcsConnector("https://host/x.ics", fake).fetch()).rejects.toThrow();
  });
});
