// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCalDavFixture } from "../fixtures/caldav-fixture";
import { IcsConnector } from "../../src/connectors/ics/ics-connector";
import { resolveSyncProvider } from "../../src/sync/resolve-provider";

describe("isolated provider matrix", () => {
  const fixture = createCalDavFixture();
  beforeEach(async () => { fixture.reset(); await fixture.start(); });
  afterEach(async () => { await fixture.close(); });

  it("covers off, incomplete, iCloud, CalDAV and ICS-only resolutions", () => {
    const base = {
      syncProvider: "none" as const,
      icloudUser: "", icloudAppPassword: "", icloudCalUrl: "",
      caldavUrl: "", caldavUser: "", caldavPass: "", icsUrl: "",
    };
    expect(resolveSyncProvider(base)).toEqual({ provider: "none" });
    expect(resolveSyncProvider({ ...base, syncProvider: "icloud" })).toEqual({ provider: "incomplete", which: "icloud" });
    expect(resolveSyncProvider({ ...base, syncProvider: "icloud", icloudUser: "u", icloudAppPassword: "p", icloudCalUrl: fixture.calendarUrl }).provider).toBe("icloud");
    expect(resolveSyncProvider({ ...base, syncProvider: "caldav", caldavUrl: fixture.calendarUrl, caldavUser: "u", caldavPass: "p" }).provider).toBe("caldav");
    expect(resolveSyncProvider({ ...base, syncProvider: "ics", icsUrl: fixture.icsUrl })).toEqual({ provider: "ics", url: fixture.icsUrl });
  });

  it("reads the ICS fixture as a read-only subscription", async () => {
    const connector = new IcsConnector(fixture.icsUrl, async (url) => {
      const response = await fetch(url);
      return { status: response.status, text: await response.text() };
    });
    const events = await connector.fetch();
    expect(events).toHaveLength(1);
    expect(events[0].protocol).toBe("ics");
    expect(fixture.requests.map((request) => request.method)).toEqual(["GET"]);
  });
});
