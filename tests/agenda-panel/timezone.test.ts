import { describe, it, expect } from "vitest";
import { todayInTimezone } from "../../src/agenda-panel/timezone";

describe("todayInTimezone", () => {
  it("returns `now` unchanged when no timezone is configured", () => {
    const now = new Date("2026-07-18T20:30:00Z");
    const out = todayInTimezone(undefined, now);
    expect(out.getTime()).toBe(now.getTime());
  });

  it("returns the wall-clock date/time in the configured zone, readable via local getters", () => {
    // 2026-07-18T20:30:00Z in America/Los_Angeles (PDT, UTC-7 in July) is 2026-07-18 13:30:00 local wall-clock.
    const now = new Date("2026-07-18T20:30:00Z");
    const out = todayInTimezone("America/Los_Angeles", now);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6); // July, 0-indexed
    expect(out.getDate()).toBe(18);
    expect(out.getHours()).toBe(13);
    expect(out.getMinutes()).toBe(30);
  });

  it("crosses a date boundary correctly when UTC and the target zone disagree on the day", () => {
    // 2026-07-19T04:00:00Z is already the 19th in UTC, but still 2026-07-18 21:00 in PDT (UTC-7).
    const now = new Date("2026-07-19T04:00:00Z");
    const out = todayInTimezone("America/Los_Angeles", now);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6);
    expect(out.getDate()).toBe(18);
    expect(out.getHours()).toBe(21);
  });
});
