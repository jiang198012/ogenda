import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../../src/settings/settings";

describe("sanitizeSettings", () => {
  it("keeps the known fields (incl. appPassword + iCloud) and drops unknown keys", () => {
    const s = sanitizeSettings({
      storageFolder: "Cal",
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      bogus: "x",
    });
    expect(s).toEqual({
      storageFolder: "Cal",
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      timezone: "",
      categoryColors: {},
    });
    expect("bogus" in s).toBe(false);
  });
  it("falls back to defaults for missing/mistyped fields", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a configured timezone and defaults to empty string when absent", () => {
    expect(sanitizeSettings({ timezone: "America/Los_Angeles" }).timezone).toBe("America/Los_Angeles");
    expect(sanitizeSettings({}).timezone).toBe("");
    expect(DEFAULT_SETTINGS.timezone).toBe("");
  });
  it("keeps a category-colors map, dropping non-string values, defaulting to {}", () => {
    expect(sanitizeSettings({ categoryColors: { 工作: "#4c8dff", 生活: 123 } }).categoryColors).toEqual({
      工作: "#4c8dff",
    });
    expect(sanitizeSettings({}).categoryColors).toEqual({});
    expect(DEFAULT_SETTINGS.categoryColors).toEqual({});
  });
});
