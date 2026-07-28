import { describe, it, expect } from "vitest";
import { isAtToday, shiftAnchorFor } from "../../src/agenda-panel/today-nav";

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

describe("shiftAnchorFor", () => {
  const d = (s: string) => new Date(`${s}T00:00:00`);

  it("moves list and day by a single day, matching isAtToday's granularity", () => {
    expect(shiftAnchorFor("list", d("2026-07-28"), 1)).toEqual(d("2026-07-29"));
    expect(shiftAnchorFor("list", d("2026-07-28"), -1)).toEqual(d("2026-07-27"));
    expect(shiftAnchorFor("day", d("2026-07-28"), 1)).toEqual(d("2026-07-29"));
  });

  it("moves week by seven days", () => {
    expect(shiftAnchorFor("week", d("2026-07-28"), 1)).toEqual(d("2026-08-04"));
    expect(shiftAnchorFor("week", d("2026-07-28"), -1)).toEqual(d("2026-07-21"));
  });

  it("moves month and stats by one calendar month", () => {
    expect(shiftAnchorFor("month", d("2026-07-15"), 1)).toEqual(d("2026-08-15"));
    expect(shiftAnchorFor("stats", d("2026-07-15"), -1)).toEqual(d("2026-06-15"));
  });

  it("clamps to the last day when the target month is shorter", () => {
    expect(shiftAnchorFor("month", d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
    expect(shiftAnchorFor("month", d("2026-03-31"), -1)).toEqual(d("2026-02-28"));
  });

  it("crosses the year boundary in both directions", () => {
    expect(shiftAnchorFor("month", d("2026-12-10"), 1)).toEqual(d("2027-01-10"));
    expect(shiftAnchorFor("list", d("2026-12-31"), 1)).toEqual(d("2027-01-01"));
    expect(shiftAnchorFor("day", d("2027-01-01"), -1)).toEqual(d("2026-12-31"));
  });
});
