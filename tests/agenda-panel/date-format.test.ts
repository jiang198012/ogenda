import { describe, it, expect } from "vitest";
import { formatDate, formatMonth, formatDayShort, formatWeek } from "../../src/agenda-panel/date-format";

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

describe("formatDayShort (list rows, no year)", () => {
  it("zh: 7月20日 周一", () => {
    expect(formatDayShort(new Date(2026, 6, 20), "zh")).toBe("7月20日 周一");
  });
  it("en: Mon, Jul 20", () => {
    expect(formatDayShort(new Date(2026, 6, 20), "en")).toBe("Mon, Jul 20");
  });
});

describe("formatWeek (ISO 8601 week + week-year)", () => {
  it("zh: 2026-07-19 is 2026年第29周", () => {
    expect(formatWeek(new Date(2026, 6, 19), "zh")).toBe("2026年第29周");
  });
  it("en: 2026-07-19 is Week 29, 2026", () => {
    expect(formatWeek(new Date(2026, 6, 19), "en")).toBe("Week 29, 2026");
  });
  it("zh: 2026-01-01 (Thu) is week 1", () => {
    expect(formatWeek(new Date(2026, 0, 1), "zh")).toBe("2026年第1周");
  });
  it("zh: 2024-12-30 (Mon) rolls into 2025 week 1 (ISO week-year)", () => {
    expect(formatWeek(new Date(2024, 11, 30), "zh")).toBe("2025年第1周");
  });
  it("en: 2024-12-30 rolls into Week 1, 2025", () => {
    expect(formatWeek(new Date(2024, 11, 30), "en")).toBe("Week 1, 2025");
  });
});
