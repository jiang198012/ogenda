import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../../src/settings/settings";

describe("sanitizeSettings", () => {
  it("keeps the known fields (incl. appPassword + iCloud) and drops unknown keys", () => {
    const s = sanitizeSettings({
      email: "a@x",
      appPassword: "pw123",
      storageFolder: "Cal",
      scanCount: 10,
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      bogus: "x",
    });
    expect(s).toEqual({
      email: "a@x",
      appPassword: "pw123",
      storageFolder: "Cal",
      scanCount: 10,
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
    });
    expect("bogus" in s).toBe(false);
  });
  it("falls back to defaults for missing/mistyped fields", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ scanCount: "50" }).scanCount).toBe(DEFAULT_SETTINGS.scanCount);
  });
});
