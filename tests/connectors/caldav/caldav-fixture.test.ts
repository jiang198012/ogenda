// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createCalDavFixture, fixtureIcs } from "../../fixtures/caldav-fixture";

vi.mock("obsidian", () => ({
  requestUrl: async (opts: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
    const response = await fetch(opts.url, { method: opts.method ?? "GET", headers: opts.headers, body: opts.body });
    return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
  },
}));

import { parseCalendarList } from "../../../src/connectors/caldav/parse-calendar-list";
import { CalDavConnector } from "../../../src/connectors/caldav/caldav-connector";
import { CalDavWriter } from "../../../src/connectors/caldav/caldav-writer";

describe("local CalDAV fixture", () => {
  const fixture = createCalDavFixture();

  beforeEach(async () => {
    fixture.reset();
    await fixture.start();
  });
  afterEach(async () => {
    await fixture.close();
  });

  it("discovers only VEVENT calendars and fetches member events", async () => {
    const propfind = await fetch(fixture.calendarUrl, { method: "PROPFIND", headers: { Depth: "1" } });
    const calendars = parseCalendarList(await propfind.text(), fixture.calendarUrl);
    expect(calendars.map((calendar) => calendar.name)).toEqual(["个人"]);

    const events = await new CalDavConnector({ user: "fixture", pass: "not-a-secret", calendarUrl: fixture.calendarUrl, label: "fixture" }).fetch();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: "fixture-1@ogenda", title: "Fixture 事件", etag: '"e1"' });
    expect(fixture.requests.map((request) => request.method)).toContain("REPORT");
  });

  it("supports create/update/delete and rejects stale ETags", async () => {
    const writer = new CalDavWriter({ user: "fixture", pass: "not-a-secret" });
    const createdUrl = `${fixture.baseUrl}/home/new.ics`;
    const created = await writer.putEvent(createdUrl, fixtureIcs("new@ogenda", "新建"));
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"e2"');

    const updated = await writer.putEvent(createdUrl, fixtureIcs("new@ogenda", "修改"), created.etag);
    expect(updated.status).toBe(204);
    expect(updated.etag).toBe('"e3"');

    const conflict = await writer.putEvent(createdUrl, fixtureIcs("new@ogenda", "冲突"), '"stale"');
    expect(conflict.status).toBe(412);
    expect((await writer.deleteEvent(createdUrl, '"stale"')).status).toBe(412);
    expect((await writer.deleteEvent(createdUrl, updated.etag!)).status).toBe(204);
    expect(fixture.events.has("/home/new.ics")).toBe(false);
  });

  it("surfaces a network failure when the isolated fixture is unavailable", async () => {
    const connector = new CalDavConnector({ user: "fixture", pass: "not-a-secret", calendarUrl: fixture.calendarUrl, label: "fixture" });
    await fixture.close();
    await expect(connector.fetch()).rejects.toThrow();
  });
});
