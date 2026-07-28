// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseCalendarList } from "../../../src/connectors/caldav/parse-calendar-list";

const HOME = "https://p42-caldav.icloud.com/10174618832/calendars/";

// Trimmed from a real iCloud calendar-home PROPFIND (Depth: 1) response.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/10174618832/calendars/</href>
    <propstat>
      <prop><displayname/><resourcetype><collection/></resourcetype></prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/home/</href>
    <propstat>
      <prop>
        <displayname>个人</displayname>
        <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
        <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/work/</href>
    <propstat>
      <prop>
        <displayname/>
        <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
        <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/tasks/</href>
    <propstat>
      <prop>
        <displayname>提醒</displayname>
        <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
        <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VTODO"/></supported-calendar-component-set>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/inbox/</href>
    <propstat>
      <prop>
        <displayname>Inbox</displayname>
        <resourcetype><collection/><schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response>
    <href>/10174618832/calendars/subscribed-cn-holiday/</href>
    <propstat>
      <prop>
        <displayname>中国节假日</displayname>
        <resourcetype>
          <collection/>
          <calendar xmlns="urn:ietf:params:xml:ns:caldav"/>
          <subscribed xmlns="http://calendarserver.org/ns/"/>
        </resourcetype>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>`;

describe("parseCalendarList", () => {
  it("keeps writable calendar collections and resolves hrefs against the home URL", () => {
    const r = parseCalendarList(XML, HOME);
    expect(r.map((c) => c.url)).toEqual([
      "https://p42-caldav.icloud.com/10174618832/calendars/home/",
      "https://p42-caldav.icloud.com/10174618832/calendars/work/",
    ]);
  });

  it("falls back to the last href segment when displayname is empty", () => {
    const r = parseCalendarList(XML, HOME);
    expect(r.map((c) => c.name)).toEqual(["个人", "work"]);
  });

  it("skips the home collection itself, schedule inboxes and read-only subscriptions", () => {
    const names = parseCalendarList(XML, HOME).map((c) => c.name);
    expect(names).not.toContain("Inbox");
    expect(names).not.toContain("中国节假日");
    expect(names.length).toBe(2);
  });

  it("skips VTODO collections — iCloud lists reminder lists as calendars too", () => {
    expect(parseCalendarList(XML, HOME).map((c) => c.name)).not.toContain("提醒");
  });

  it("keeps a collection that advertises VEVENT among several components", () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/x/calendars/mixed/</href><propstat><prop>
      <displayname>混合</displayname>
      <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
      <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/><comp name="VTODO"/></supported-calendar-component-set>
    </prop></propstat></response></multistatus>`;
    expect(parseCalendarList(xml, HOME).map((c) => c.name)).toEqual(["混合"]);
  });

  it("keeps a collection that does not advertise components at all (RFC 4791 default)", () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/x/calendars/plain/</href><propstat><prop>
      <displayname>无声明</displayname>
      <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
    </prop></propstat></response></multistatus>`;
    expect(parseCalendarList(xml, HOME).map((c) => c.name)).toEqual(["无声明"]);
  });

  it("returns empty for a response with no calendar collections", () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/x/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response></multistatus>`;
    expect(parseCalendarList(xml, HOME)).toEqual([]);
  });
});
