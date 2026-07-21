import { describe, it, expect, afterEach } from "vitest";
import { buildTimezoneOptions } from "../../src/settings/timezone-options";
import { setLanguage } from "../../src/i18n";

describe("buildTimezoneOptions", () => {
  afterEach(() => {
    setLanguage("en");
  });

  it("formats each option as '<+/-H:MM>(<city>)' using Chinese city names when language is zh", () => {
    setLanguage("zh");
    const now = new Date("2026-07-18T12:00:00Z");
    const options = buildTimezoneOptions(now);
    const beijing = options.find((o) => o.iana === "Asia/Shanghai");
    expect(beijing?.label).toBe("+8:00(北京)");
    const tokyo = options.find((o) => o.iana === "Asia/Tokyo");
    expect(tokyo?.label).toBe("+9:00(东京)");
  });

  it("uses English city names when language is en", () => {
    setLanguage("en");
    const options = buildTimezoneOptions(new Date("2026-07-18T12:00:00Z"));
    expect(options.find((o) => o.iana === "Asia/Shanghai")?.label).toBe("+8:00(Beijing)");
    expect(options.find((o) => o.iana === "Asia/Tokyo")?.label).toBe("+9:00(Tokyo)");
  });

  it("recomputes DST-affected offsets correctly across winter/summer in the current language", () => {
    setLanguage("zh");
    const winter = buildTimezoneOptions(new Date("2026-01-15T12:00:00Z"));
    const summer = buildTimezoneOptions(new Date("2026-07-15T12:00:00Z"));
    const laWinter = winter.find((o) => o.iana === "America/Los_Angeles");
    const laSummer = summer.find((o) => o.iana === "America/Los_Angeles");
    expect(laWinter?.label).toBe("-8:00(洛杉矶)"); // PST
    expect(laSummer?.label).toBe("-7:00(洛杉矶)"); // PDT
  });

  it("covers a representative city for every major UTC offset from -8 to +9 without duplicate ianas", () => {
    const options = buildTimezoneOptions(new Date("2026-07-18T12:00:00Z"));
    const ianas = options.map((o) => o.iana);
    expect(new Set(ianas).size).toBe(ianas.length); // no duplicates
    for (const required of ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Shanghai", "Asia/Tokyo"]) {
      expect(ianas).toContain(required);
    }
  });

  it("each option carries both the Chinese and English city name, not just the rendered label", () => {
    const options = buildTimezoneOptions(new Date("2026-07-18T12:00:00Z"));
    const beijing = options.find((o) => o.iana === "Asia/Shanghai")!;
    expect(beijing.cityZh).toBe("北京");
    expect(beijing.cityEn).toBe("Beijing");
  });
});
