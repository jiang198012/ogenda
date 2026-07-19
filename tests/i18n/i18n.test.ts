import { describe, it, expect, beforeEach } from "vitest";
import { t, setLanguage, getLanguage, resolveLanguage } from "../../src/i18n";
import { zh } from "../../src/i18n/zh";
import { en } from "../../src/i18n/en";

describe("resolveLanguage", () => {
  it("auto follows Obsidian locale (zh* → zh, else en)", () => {
    expect(resolveLanguage("auto", "zh")).toBe("zh");
    expect(resolveLanguage("auto", "zh-TW")).toBe("zh");
    expect(resolveLanguage("auto", "en")).toBe("en");
    expect(resolveLanguage("auto", "")).toBe("en");
  });
  it("explicit setting wins over locale", () => {
    expect(resolveLanguage("zh", "en")).toBe("zh");
    expect(resolveLanguage("en", "zh")).toBe("en");
  });
});

describe("t", () => {
  beforeEach(() => setLanguage("zh"));
  it("looks up the current language table", () => {
    setLanguage("zh");
    expect(t("view.tab.list")).toBe("清单");
    setLanguage("en");
    expect(t("view.tab.list")).toBe("List");
  });
  it("interpolates {params}", () => {
    setLanguage("en");
    // uses a key that carries a param — see en.ts "notice.panelLoadError"
    expect(t("notice.panelLoadError", { msg: "boom" })).toContain("boom");
  });
  it("falls back to en then to the key itself for a missing key", () => {
    setLanguage("zh");
    expect(t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });
  it("getLanguage reflects setLanguage", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
  });
});

describe("zh/en key parity", () => {
  it("both tables have exactly the same key set", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
