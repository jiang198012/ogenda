import { describe, it, expect } from "vitest";
import { resolveSyncProvider } from "../../src/sync/resolve-provider";

const base = {
  syncProvider: "none" as const,
  icloudUser: "", icloudAppPassword: "", icloudCalUrl: "",
  caldavUrl: "", caldavUser: "", caldavPass: "", icsUrl: "",
};

describe("resolveSyncProvider", () => {
  it("none", () => {
    expect(resolveSyncProvider({ ...base })).toEqual({ provider: "none" });
  });
  it("icloud complete -> creds", () => {
    expect(
      resolveSyncProvider({ ...base, syncProvider: "icloud", icloudUser: "u", icloudAppPassword: "p", icloudCalUrl: "https://c" }),
    ).toEqual({ provider: "icloud", user: "u", pass: "p", calUrl: "https://c" });
  });
  it("icloud missing url -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "icloud", icloudUser: "u", icloudAppPassword: "p" })).toEqual({
      provider: "incomplete",
      which: "icloud",
    });
  });
  it("caldav complete -> creds", () => {
    expect(
      resolveSyncProvider({ ...base, syncProvider: "caldav", caldavUrl: "https://c", caldavUser: "u", caldavPass: "p" }),
    ).toEqual({ provider: "caldav", user: "u", pass: "p", calUrl: "https://c" });
  });
  it("caldav missing pass -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "caldav", caldavUrl: "https://c", caldavUser: "u" })).toEqual({
      provider: "incomplete",
      which: "caldav",
    });
  });
  it("ics complete -> url", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "ics", icsUrl: "https://x.ics" })).toEqual({
      provider: "ics",
      url: "https://x.ics",
    });
  });
  it("ics missing url -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "ics" })).toEqual({ provider: "incomplete", which: "ics" });
  });
});
