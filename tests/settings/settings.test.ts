import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../../src/settings/settings";
import { defaultTimeSegments } from "../../src/agenda-panel/time-segments";
import { setLanguage } from "../../src/i18n";

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
      syncProvider: "none",
      caldavUrl: "",
      caldavUser: "",
      caldavPass: "",
      icsUrl: "",
      timezone: "",
      language: "auto",
      defaultCategory: "",
      remindersEnabled: false,
      defaultReminderMinutes: -1,
      timeSegments: defaultTimeSegments(),
    });
    expect("bogus" in s).toBe(false);
  });
  it("falls back to defaults for missing/mistyped fields", () => {
    setLanguage("en");
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a configured timezone and defaults to empty string when absent", () => {
    expect(sanitizeSettings({ timezone: "America/Los_Angeles" }).timezone).toBe("America/Los_Angeles");
    expect(sanitizeSettings({}).timezone).toBe("");
    expect(DEFAULT_SETTINGS.timezone).toBe("");
  });
  it("keeps a valid language and defaults to auto", () => {
    expect(sanitizeSettings({ language: "en" }).language).toBe("en");
    expect(sanitizeSettings({ language: "zh" }).language).toBe("zh");
    expect(sanitizeSettings({ language: "bogus" }).language).toBe("auto");
    expect(sanitizeSettings({}).language).toBe("auto");
  });
  it("keeps a valid syncProvider and defaults to none", () => {
    expect(sanitizeSettings({ syncProvider: "icloud" }).syncProvider).toBe("icloud");
    expect(sanitizeSettings({ syncProvider: "caldav" }).syncProvider).toBe("caldav");
    expect(sanitizeSettings({ syncProvider: "ics" }).syncProvider).toBe("ics");
    expect(sanitizeSettings({ syncProvider: "bogus" }).syncProvider).toBe("none");
    expect(sanitizeSettings({}).syncProvider).toBe("none");
  });
  it("keeps a configured defaultCategory and defaults to empty string when absent", () => {
    expect(sanitizeSettings({ defaultCategory: "工作" }).defaultCategory).toBe("工作");
    expect(sanitizeSettings({ defaultCategory: 123 }).defaultCategory).toBe("");
    expect(sanitizeSettings({}).defaultCategory).toBe("");
    expect(DEFAULT_SETTINGS.defaultCategory).toBe("");
  });
  it("sanitizes timeSegments: array → per-row cleanup; empty → empty; garbage → defaults", () => {
    expect(sanitizeSettings({ timeSegments: [] }).timeSegments).toEqual([]);
    const cleaned = sanitizeSettings({
      timeSegments: [{ name: "自定义", start: "08:00", end: "10:00", color: "#112233", enabled: false }],
    }).timeSegments;
    expect(cleaned).toEqual([{ name: "自定义", start: "08:00", end: "10:00", color: "#112233", enabled: false }]);
    expect(sanitizeSettings({ timeSegments: "nope" }).timeSegments.length).toBeGreaterThan(0);
  });
});
