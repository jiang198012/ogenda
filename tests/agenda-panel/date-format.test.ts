import { describe, it, expect } from "vitest";
import { formatChineseDate, formatChineseMonth } from "../../src/agenda-panel/date-format";

describe("formatChineseDate", () => {
  it("formats a date as 2026年7月19日 星期日", () => {
    expect(formatChineseDate(new Date(2026, 6, 19))).toBe("2026年7月19日 星期日");
  });
  it("uses the correct weekday name for a weekday", () => {
    expect(formatChineseDate(new Date(2026, 6, 17))).toBe("2026年7月17日 星期五");
  });
  it("handles single-digit month and day without padding", () => {
    expect(formatChineseDate(new Date(2026, 0, 3))).toBe("2026年1月3日 星期六");
  });
});

describe("formatChineseMonth", () => {
  it("formats a month as 2026年7月", () => {
    expect(formatChineseMonth(new Date(2026, 6, 1))).toBe("2026年7月");
  });
});
