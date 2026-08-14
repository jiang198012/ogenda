import { describe, it, expect } from "vitest";
import {
  TimeSegment,
  segmentMinutes,
  validateSegment,
  sanitizeSegment,
  segmentRects,
  hexWithAlpha,
  defaultTimeSegments,
  visibleRange,
} from "../../src/agenda-panel/time-segments";
import { setLanguage } from "../../src/i18n";

const seg = (o: Partial<TimeSegment>): TimeSegment => ({
  name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true, ...o,
});

describe("segmentMinutes", () => {
  it("parses HH:MM to minutes", () => {
    expect(segmentMinutes("06:00")).toBe(360);
    expect(segmentMinutes("23:59")).toBe(1439);
    expect(segmentMinutes("24:00")).toBe(1440); // 段末哨兵
    expect(segmentMinutes("9:30")).toBe(570);
  });
  it("rejects garbage", () => {
    expect(segmentMinutes("")).toBeNull();
    expect(segmentMinutes("25:00")).toBeNull();
    expect(segmentMinutes("12:60")).toBeNull();
    expect(segmentMinutes("abc")).toBeNull();
  });
});

describe("validateSegment", () => {
  it("accepts a well-formed segment", () => {
    expect(validateSegment(seg({}))).toEqual([]);
  });
  it("flags empty name / bad time / bad color", () => {
    expect(validateSegment(seg({ name: " " })).length).toBeGreaterThan(0);
    expect(validateSegment(seg({ start: "25:00" })).length).toBeGreaterThan(0);
    expect(validateSegment(seg({ end: "oops" })).length).toBeGreaterThan(0);
    expect(validateSegment(seg({ color: "blue" })).length).toBeGreaterThan(0);
  });
});

describe("sanitizeSegment", () => {
  it("fills missing fields from defaults and keeps valid ones", () => {
    const s = sanitizeSegment({ name: "自定义", start: "08:00", end: "10:00", color: "#112233", enabled: false }, 0);
    expect(s).toEqual({ name: "自定义", start: "08:00", end: "10:00", color: "#112233", enabled: false });
  });
  it("falls back on garbage values", () => {
    const s = sanitizeSegment({ name: "", start: "xx", color: "nope" }, 1);
    expect(s.name).toBeTruthy();
    expect(segmentMinutes(s.start)).not.toBeNull();
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("segmentRects", () => {
  it("maps enabled segments to day-minute rects", () => {
    const rects = segmentRects([seg({ name: "早", start: "06:00", end: "09:00", color: "#111111" })]);
    expect(rects).toEqual([{ topMin: 360, bottomMin: 540, color: "#111111", name: "早" }]);
  });

  it("skips disabled segments and invalid times", () => {
    expect(segmentRects([seg({ enabled: false }), seg({ start: "oops" })])).toEqual([]);
  });

  it("splits a midnight-crossing segment into two rects", () => {
    const rects = segmentRects([seg({ start: "22:00", end: "02:00", color: "#222222" })]);
    expect(rects).toEqual([
      { topMin: 22 * 60, bottomMin: 1440, color: "#222222", name: "上午" },
      { topMin: 0, bottomMin: 120, color: "#222222", name: "上午" },
    ]);
  });

  it("sorts by start so later segments paint over earlier ones", () => {
    const rects = segmentRects([
      seg({ start: "12:00", end: "18:00", color: "#aaa" }),
      seg({ start: "06:00", end: "12:00", color: "#bbb" }),
    ]);
    expect(rects.map((r) => r.color)).toEqual(["#bbb", "#aaa"]);
  });

  it("drops zero-length segments", () => {
    expect(segmentRects([seg({ start: "09:00", end: "09:00" })])).toEqual([]);
  });

  it("returns [] when every segment is disabled", () => {
    expect(segmentRects([seg({ enabled: false }), seg({ enabled: false })])).toEqual([]);
  });
});

describe("hexWithAlpha", () => {
  it("converts hex to rgba", () => {
    expect(hexWithAlpha("#3B82F6", 0.14)).toBe("rgba(59, 130, 246, 0.14)");
  });
  it("passes through non-hex", () => {
    expect(hexWithAlpha("blue", 0.5)).toBe("blue");
  });
});

describe("visibleRange", () => {
  it("spans from the earliest start to the latest end of enabled segments", () => {
    expect(visibleRange([seg({ start: "08:30", end: "12:00" }), seg({ start: "06:00", end: "08:30" }), seg({ start: "20:00", end: "23:00" })])).toEqual({
      startMin: 6 * 60,
      endMin: 23 * 60,
    });
  });

  it("ignores disabled segments", () => {
    expect(visibleRange([seg({ start: "06:00", end: "08:30" }), seg({ start: "23:00", end: "24:00", enabled: false })])).toEqual({
      startMin: 6 * 60,
      endMin: 8 * 60 + 30,
    });
  });

  it("returns the full day when nothing is enabled", () => {
    expect(visibleRange([seg({ enabled: false }), seg({ enabled: false })])).toEqual({ startMin: 0, endMin: 1440 });
    expect(visibleRange([])).toEqual({ startMin: 0, endMin: 1440 });
  });

  it("returns the full day when a midnight-crossing segment exists", () => {
    expect(visibleRange([seg({ start: "22:00", end: "02:00" })])).toEqual({ startMin: 0, endMin: 1440 });
  });

  it("default six segments yield 06:00–23:00", () => {
    expect(visibleRange(defaultTimeSegments())).toEqual({ startMin: 6 * 60, endMin: 23 * 60 });
  });
});

describe("defaultTimeSegments", () => {
  it("provides six enabled segments covering 06:00–23:00 contiguously", () => {
    setLanguage("zh");
    const segs = defaultTimeSegments();
    expect(segs).toHaveLength(6);
    expect(segs.every((s) => s.enabled)).toBe(true);
    // 用户指定:06:00–08:30 清晨 / 08:30–12:00 上午 / 12:00–14:00 中午 /
    // 14:00–17:00 下午 / 17:00–20:00 傍晚 / 20:00–23:00 晚上
    expect(segs.map((s) => `${s.name}:${s.start}-${s.end}`)).toEqual([
      "清晨:06:00-08:30",
      "上午:08:30-12:00",
      "中午:12:00-14:00",
      "下午:14:00-17:00",
      "傍晚:17:00-20:00",
      "晚上:20:00-23:00",
    ]);
    // 首尾相接,无重叠无缝隙
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBe(segs[i - 1].end);
    }
    expect(segs[0].start).toBe("06:00");
    expect(segs[5].end).toBe("23:00");
  });

  it("default segments produce six rects sorted by start", () => {
    const rects = segmentRects(defaultTimeSegments());
    expect(rects).toHaveLength(6);
    expect(rects[0].topMin).toBe(6 * 60);
    expect(rects[5].bottomMin).toBe(23 * 60);
  });
});
