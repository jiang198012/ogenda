import { describe, it, expect } from "vitest";
import { parseQuickAdd, parseQuickAddDate, parseQuickAddTime, parseQuickAddDuration } from "../../src/agenda-panel/quick-add";

// 2026-07-13 是周一
const ANCHOR = new Date(2026, 6, 13);

describe("parseQuickAddDate", () => {
  it("今天/明天/后天/大后天/昨天", () => {
    expect(parseQuickAddDate("今天", ANCHOR)).toBe("2026-07-13");
    expect(parseQuickAddDate("明天", ANCHOR)).toBe("2026-07-14");
    expect(parseQuickAddDate("后天", ANCHOR)).toBe("2026-07-15");
    expect(parseQuickAddDate("大后天", ANCHOR)).toBe("2026-07-16");
    expect(parseQuickAddDate("昨天", ANCHOR)).toBe("2026-07-12");
  });

  it("英文 today/tomorrow/yesterday", () => {
    expect(parseQuickAddDate("today", ANCHOR)).toBe("2026-07-13");
    expect(parseQuickAddDate("tomorrow", ANCHOR)).toBe("2026-07-14");
    expect(parseQuickAddDate("yesterday", ANCHOR)).toBe("2026-07-12");
  });

  it("周X:本周内未过 → 本周;已过 → 下周", () => {
    // 周一(今天)当天
    expect(parseQuickAddDate("周一", ANCHOR)).toBe("2026-07-13");
    // 周三 → 本周三
    expect(parseQuickAddDate("周三", ANCHOR)).toBe("2026-07-15");
    // 周日(已过) → 下周日 07-19
    expect(parseQuickAddDate("周日", ANCHOR)).toBe("2026-07-19");
    expect(parseQuickAddDate("星期天", ANCHOR)).toBe("2026-07-19");
    expect(parseQuickAddDate("礼拜日", ANCHOR)).toBe("2026-07-19");
    // 下周五 → 07-17
    expect(parseQuickAddDate("下周五", ANCHOR)).toBe("2026-07-17");
    expect(parseQuickAddDate("下星期一", ANCHOR)).toBe("2026-07-20");
  });

  it("英文 weekday: monday → 本周一;next friday → 07-17", () => {
    expect(parseQuickAddDate("monday", ANCHOR)).toBe("2026-07-13");
    expect(parseQuickAddDate("friday", ANCHOR)).toBe("2026-07-17");
    expect(parseQuickAddDate("next friday", ANCHOR)).toBe("2026-07-17");
    expect(parseQuickAddDate("next monday", ANCHOR)).toBe("2026-07-20");
  });

  it("显式日期 YYYY-MM-DD / MM-DD", () => {
    expect(parseQuickAddDate("2026-08-01", ANCHOR)).toBe("2026-08-01");
    expect(parseQuickAddDate("8-01", ANCHOR)).toBe("2026-08-01");
    expect(parseQuickAddDate("2026/12/31", ANCHOR)).toBe("2026-12-31");
  });

  it("无法识别返回 null", () => {
    expect(parseQuickAddDate("开会", ANCHOR)).toBeNull();
    expect(parseQuickAddDate("", ANCHOR)).toBeNull();
  });
});

describe("parseQuickAddTime", () => {
  it("24 小时制 HH:MM", () => {
    expect(parseQuickAddTime("14:23")).toEqual({ minutes: 14 * 60 + 23, raw: "14:23" });
    expect(parseQuickAddTime("09:00 开会")).toEqual({ minutes: 540, raw: "09:00" });
  });

  it("下午/晚上前缀加 12 小时", () => {
    expect(parseQuickAddTime("下午3点")).toEqual({ minutes: 15 * 60, raw: "下午3点" });
    expect(parseQuickAddTime("晚上8点半")).toEqual({ minutes: 20 * 60 + 30, raw: "晚上8点半" });
    expect(parseQuickAddTime("下午3点45分")).toEqual({ minutes: 15 * 60 + 45, raw: "下午3点45分" });
  });

  it("早上/上午/中午/裸时间", () => {
    expect(parseQuickAddTime("早上9点")).toEqual({ minutes: 9 * 60, raw: "早上9点" });
    expect(parseQuickAddTime("上午10点半")).toEqual({ minutes: 10 * 60 + 30, raw: "上午10点半" });
    expect(parseQuickAddTime("中午12点")).toEqual({ minutes: 12 * 60, raw: "中午12点" });
    expect(parseQuickAddTime("9点")).toEqual({ minutes: 9 * 60, raw: "9点" });
    expect(parseQuickAddTime("15点")).toEqual({ minutes: 15 * 60, raw: "15点" });
    expect(parseQuickAddTime("两点半")).toEqual({ minutes: 2 * 60 + 30, raw: "两点半" });
  });

  it("am/pm 制", () => {
    expect(parseQuickAddTime("3pm")).toEqual({ minutes: 15 * 60, raw: "3pm" });
    expect(parseQuickAddTime("3:30pm")).toEqual({ minutes: 15 * 60 + 30, raw: "3:30pm" });
    expect(parseQuickAddTime("9am")).toEqual({ minutes: 9 * 60, raw: "9am" });
    expect(parseQuickAddTime("12pm")).toEqual({ minutes: 12 * 60, raw: "12pm" });
  });

  it("找不到返回 null", () => {
    expect(parseQuickAddTime("开会讨论")).toBeNull();
  });
});

describe("parseQuickAddDuration", () => {
  it("中文时长", () => {
    expect(parseQuickAddDuration("1小时")).toEqual({ minutes: 60, raw: "1小时" });
    expect(parseQuickAddDuration("1.5小时")).toEqual({ minutes: 90, raw: "1.5小时" });
    expect(parseQuickAddDuration("30分钟")).toEqual({ minutes: 30, raw: "30分钟" });
    expect(parseQuickAddDuration("半小时")).toEqual({ minutes: 30, raw: "半小时" });
  });

  it("英文时长", () => {
    expect(parseQuickAddDuration("2h")).toEqual({ minutes: 120, raw: "2h" });
    expect(parseQuickAddDuration("90min")).toEqual({ minutes: 90, raw: "90min" });
    expect(parseQuickAddDuration("1.5 hours")).toEqual({ minutes: 90, raw: "1.5 hours" });
  });

  it("找不到返回 null", () => {
    expect(parseQuickAddDuration("开会")).toBeNull();
  });
});

describe("parseQuickAdd", () => {
  it("明天下午3点 和经理开会 → 明天 15:00,时长 1 小时", () => {
    const r = parseQuickAdd("明天下午3点 和经理开会", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "和经理开会",
      start: "2026-07-14T15:00:00",
      end: "2026-07-14T16:00:00",
      allDay: false,
    });
  });

  it("周五 10:00 周会 1小时", () => {
    const r = parseQuickAdd("周五 10:00 周会 1小时", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "周会",
      start: "2026-07-17T10:00:00",
      end: "2026-07-17T11:00:00",
      allDay: false,
    });
  });

  it("今天 14:23 代码评审 30分钟", () => {
    const r = parseQuickAdd("今天 14:23 代码评审 30分钟", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "代码评审",
      start: "2026-07-13T14:23:00",
      end: "2026-07-13T14:53:00",
      allDay: false,
    });
  });

  it("无日期默认今天、无时间默认 09:00", () => {
    const r = parseQuickAdd("写周报", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "写周报",
      start: "2026-07-13T09:00:00",
      end: "2026-07-13T10:00:00",
      allDay: false,
    });
  });

  it("2026-08-01 下午3点 团建", () => {
    const r = parseQuickAdd("2026-08-01 下午3点 团建", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "团建",
      start: "2026-08-01T15:00:00",
      end: "2026-08-01T16:00:00",
      allDay: false,
    });
  });

  it("英文: tomorrow 3pm standup 30min", () => {
    const r = parseQuickAdd("tomorrow 3pm standup 30min", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "standup",
      start: "2026-07-14T15:00:00",
      end: "2026-07-14T15:30:00",
      allDay: false,
    });
  });

  it("跨午夜:晚上11点 夜班 2小时", () => {
    const r = parseQuickAdd("明天晚上11点 夜班 2小时", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "夜班",
      start: "2026-07-14T23:00:00",
      end: "2026-07-15T01:00:00",
      allDay: false,
    });
  });

  it("标题里的数字不误判为时间/日期", () => {
    const r = parseQuickAdd("提交 v2 版本", ANCHOR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe("提交 v2 版本");
  });

  it("空输入 → empty;只有时间 → noTitle", () => {
    expect(parseQuickAdd("", ANCHOR).ok).toBe(false);
    const onlyTime = parseQuickAdd("下午3点", ANCHOR);
    expect(onlyTime.ok).toBe(false);
    if (onlyTime.ok) return;
    expect(onlyTime.reason).toBe("quickadd.noTitle");
  });

  it("「下周」系列: 下周一 9点 复盘会", () => {
    const r = parseQuickAdd("下周一 9点 复盘会", ANCHOR);
    expect(r).toEqual({
      ok: true,
      title: "复盘会",
      start: "2026-07-20T09:00:00",
      end: "2026-07-20T10:00:00",
      allDay: false,
    });
  });
});
