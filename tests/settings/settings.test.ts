import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../../src/settings/settings";

describe("sanitizeSettings", () => {
  it("keeps only the 4 known fields and strips extras like appPassword", () => {
    const s = sanitizeSettings({ email: "a@x", storageFolder: "Cal", scanCount: 10, syncOnStartup: true, appPassword: "SECRET" });
    expect(s).toEqual({ email: "a@x", storageFolder: "Cal", scanCount: 10, syncOnStartup: true });
    expect("appPassword" in s).toBe(false);
  });
  it("falls back to defaults for missing/mistyped fields", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ scanCount: "50" }).scanCount).toBe(DEFAULT_SETTINGS.scanCount);
  });
});
