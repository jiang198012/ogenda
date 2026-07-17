import { describe, it, expect } from "vitest";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../../src/settings/settings";

describe("sanitizeSettings", () => {
  it("strips a plaintext appPassword but keeps the known fields (+ null ciphertext)", () => {
    const s = sanitizeSettings({ email: "a@x", storageFolder: "Cal", scanCount: 10, syncOnStartup: true, appPassword: "SECRET" });
    expect(s).toEqual({ email: "a@x", storageFolder: "Cal", scanCount: 10, syncOnStartup: true, encryptedPassword: null });
    expect("appPassword" in s).toBe(false);
  });
  it("preserves a valid encryptedPassword ciphertext, drops a malformed one", () => {
    const enc = { v: 1, salt: "aa", iv: "bb", tag: "cc", data: "dd" };
    expect(sanitizeSettings({ encryptedPassword: enc }).encryptedPassword).toEqual(enc);
    expect(sanitizeSettings({ encryptedPassword: { bogus: true } }).encryptedPassword).toBeNull();
  });
  it("falls back to defaults for missing/mistyped fields", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ scanCount: "50" }).scanCount).toBe(DEFAULT_SETTINGS.scanCount);
  });
});
