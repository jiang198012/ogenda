// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseCalendarQuery } from "../../../src/connectors/caldav/parse-report";

// Trimmed from the real iCloud calendar-query response observed in the D0 spike.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/10174618832/calendars/home/</href>
    <propstat>
      <prop><getetag>"kn7acbdj"</getetag></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
    <propstat>
      <prop><calendar-data xmlns="urn:ietf:params:xml:ns:caldav"/></prop>
      <status>HTTP/1.1 404 Not Found</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/home/2143C225.ics</href>
    <propstat>
      <prop>
        <getetag>"kn7acbt5"</getetag>
        <calendar-data xmlns="urn:ietf:params:xml:ns:caldav"><![CDATA[BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:2143C225
SUMMARY:出差北京
DTSTART;TZID=Asia/Shanghai:20190712T180000
END:VEVENT
END:VCALENDAR]]></calendar-data>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

describe("parseCalendarQuery", () => {
  it("keeps member resources with calendar-data, skips the collection self", () => {
    const r = parseCalendarQuery(XML);
    expect(r.length).toBe(1);
    expect(r[0].href).toBe("/10174618832/calendars/home/2143C225.ics");
    expect(r[0].etag).toBe('"kn7acbt5"');
    expect(r[0].ics).toContain("BEGIN:VCALENDAR");
    expect(r[0].ics).toContain("SUMMARY:出差北京");
  });
  it("returns empty when no response has VCALENDAR data", () => {
    const empty = `<multistatus xmlns="DAV:"><response><href>/cal/</href><propstat><prop><calendar-data xmlns="urn:ietf:params:xml:ns:caldav"/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response></multistatus>`;
    expect(parseCalendarQuery(empty)).toEqual([]);
  });
});
