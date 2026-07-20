import { describe, it, expect } from "vitest";
import { isAtToday } from "../../src/agenda-panel/today-nav";

const TODAY = new Date(2026, 6, 19); // Sun 2026-07-19 (its Monday-start week is Jul 13..19)

describe("isAtToday", () => {
  it("day: true only for the same calendar day", () => {
    expect(isAtToday("day", new Date(2026, 6, 19), TODAY)).toBe(true);
    expect(isAtToday("day", new Date(2026, 6, 18), TODAY)).toBe(false);
  });

  it("list: same-day semantics as day", () => {
    expect(isAtToday("list", new Date(2026, 6, 19), TODAY)).toBe(true);
    expect(isAtToday("list", new Date(2026, 6, 20), TODAY)).toBe(false);
  });

  it("week: true anywhere in today's Monday-start week", () => {
    expect(isAtToday("week", new Date(2026, 6, 13), TODAY)).toBe(true); // Mon of this week
    expect(isAtToday("week", new Date(2026, 6, 15), TODAY)).toBe(true); // Wed
    expect(isAtToday("week", new Date(2026, 6, 6), TODAY)).toBe(false); // previous week
  });

  it("month: true anywhere in the same calendar month", () => {
    expect(isAtToday("month", new Date(2026, 6, 1), TODAY)).toBe(true);
    expect(isAtToday("month", new Date(2026, 6, 31), TODAY)).toBe(true);
    expect(isAtToday("month", new Date(2026, 5, 30), TODAY)).toBe(false); // June
  });

  it("stats: same-month semantics as month", () => {
    expect(isAtToday("stats", new Date(2026, 6, 10), TODAY)).toBe(true);
    expect(isAtToday("stats", new Date(2026, 7, 1), TODAY)).toBe(false); // August
  });
});
