import { describe, it, expect } from "vitest";
import { formatDate, formatMonth } from "../../src/agenda-panel/date-format";

describe("formatDate (language-aware)", () => {
  it("zh: 2026年7月19日 星期日", () => {
    expect(formatDate(new Date(2026, 6, 19), "zh")).toBe("2026年7月19日 星期日");
  });
  it("en: Sun, Jul 19, 2026", () => {
    expect(formatDate(new Date(2026, 6, 19), "en")).toBe("Sun, Jul 19, 2026");
  });
  it("zh: uses the correct weekday name for a weekday", () => {
    expect(formatDate(new Date(2026, 6, 17), "zh")).toBe("2026年7月17日 星期五");
  });
  it("zh: handles single-digit month and day without padding", () => {
    expect(formatDate(new Date(2026, 0, 3), "zh")).toBe("2026年1月3日 星期六");
  });
});

describe("formatMonth (language-aware)", () => {
  it("zh 2026年7月 / en Jul 2026", () => {
    expect(formatMonth(new Date(2026, 6, 1), "zh")).toBe("2026年7月");
    expect(formatMonth(new Date(2026, 6, 1), "en")).toBe("Jul 2026");
  });
});
