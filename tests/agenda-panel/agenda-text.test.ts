import { describe, it, expect, beforeEach } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { buildAgendaText } from "../../src/agenda-panel/agenda-text";
import { setLanguage } from "../../src/i18n";

const mk = (uid: string, start: string, title: string, extra: Partial<AgendaEvent> = {}): AgendaEvent => ({
  uid,
  title,
  start,
  origin: "synced",
  ...extra,
});

// 2026-08-19 是周三;所在周为 08-17(周一)~08-23(周日)
const DAY_START = new Date(2026, 7, 19);
const DAY_END = new Date(2026, 7, 20);
const WEEK_START = new Date(2026, 7, 17);
const WEEK_END = new Date(2026, 7, 24);

beforeEach(() => setLanguage("zh"));

describe("buildAgendaText — 纯文本样式", () => {
  it("formats a timed event with location as one row under a day header", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-19T09:00:00", "晨会", { end: "2026-08-19T10:00:00", location: "会议室" })],
      DAY_START,
      DAY_END,
      "plain",
    );
    expect(r.text).toBe("8月19日 周三\n09:00-10:00 晨会 @会议室");
    expect(r.count).toBe(1);
  });

  it("labels an all-day event as 全天, and shows start-only events without an end time", () => {
    const r = buildAgendaText(
      [
        mk("a@x", "2026-08-19", "纪念日", { allDay: true }),
        mk("b@x", "2026-08-19T15:00:00", "与王金媛聊聊"),
      ],
      DAY_START,
      DAY_END,
      "plain",
    );
    expect(r.text).toBe("8月19日 周三\n全天 纪念日\n15:00 与王金媛聊聊");
    expect(r.count).toBe(2);
  });

  it("sorts rows within a day: all-day first, then by start time", () => {
    const r = buildAgendaText(
      [
        mk("c@x", "2026-08-19T18:00:00", "晚宴", { end: "2026-08-19T20:00:00" }),
        mk("a@x", "2026-08-19T09:00:00", "晨会", { end: "2026-08-19T10:00:00" }),
        mk("b@x", "2026-08-19", "全天事", { allDay: true }),
      ],
      DAY_START,
      DAY_END,
      "plain",
    );
    const lines = r.text.split("\n").slice(1);
    expect(lines).toEqual(["全天 全天事", "09:00-10:00 晨会", "18:00-20:00 晚宴"]);
  });
});

describe("buildAgendaText — 跨天与多天", () => {
  it("clips a multi-day timed trip: first day to 24:00, middle days 全天, last day from 00:00", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-18T15:00:00", "出差深圳", { end: "2026-08-20T10:00:00" })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.text).toBe(
      "8月18日 周二\n15:00-24:00 出差深圳\n\n8月19日 周三\n全天 出差深圳\n\n8月20日 周四\n00:00-10:00 出差深圳",
    );
    expect(r.count).toBe(3);
  });

  it("expands a multi-day all-day event on every covered day, end date exclusive", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-18", "团建", { end: "2026-08-20", allDay: true })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.text).toBe("8月18日 周二\n全天 团建\n\n8月19日 周三\n全天 团建");
    expect(r.count).toBe(2);
  });

  it("clips recurring multi-day timed instances across days, same as non-recurring ones", () => {
    // expandOccurrences 对 rrule 实例不做逐日裁剪(周视图横条依赖完整实例跨度),
    // 文本导出必须自己切齐,否则后几天丢失、时间标签倒挂成 "15:00-10:00"。
    const r = buildAgendaText(
      [mk("a@x", "2026-08-18T15:00:00", "周中驻场", { end: "2026-08-20T10:00:00", rrule: "FREQ=WEEKLY;COUNT=1" })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.text).toBe(
      "8月18日 周二\n15:00-24:00 周中驻场\n\n8月19日 周三\n全天 周中驻场\n\n8月20日 周四\n00:00-10:00 周中驻场",
    );
    expect(r.count).toBe(3);
  });

  it("expands a recurring multi-day all-day instance on every covered day", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-18", "双日全天", { end: "2026-08-20", allDay: true, rrule: "FREQ=MONTHLY;COUNT=1" })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.text).toBe("8月18日 周二\n全天 双日全天\n\n8月19日 周三\n全天 双日全天");
    expect(r.count).toBe(2);
  });

  it("skips days with no events and returns empty text when the whole range is empty", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-19T09:00:00", "晨会", { end: "2026-08-19T10:00:00" })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.text).toBe("8月19日 周三\n09:00-10:00 晨会");

    const empty = buildAgendaText([], WEEK_START, WEEK_END, "plain");
    expect(empty.text).toBe("");
    expect(empty.count).toBe(0);
  });

  it("expands recurring events into each instance's day", () => {
    const r = buildAgendaText(
      [mk("a@x", "2026-08-17T09:00:00", "站会", { end: "2026-08-17T09:30:00", rrule: "FREQ=DAILY;COUNT=3" })],
      WEEK_START,
      WEEK_END,
      "plain",
    );
    expect(r.count).toBe(3);
    expect(r.text).toContain("8月17日 周一\n09:00-09:30 站会");
    expect(r.text).toContain("8月18日 周二\n09:00-09:30 站会");
    expect(r.text).toContain("8月19日 周三\n09:00-09:30 站会");
  });
});

describe("buildAgendaText — markdown 样式与英文", () => {
  it("renders markdown: bold day headers and list rows", () => {
    const r = buildAgendaText(
      [
        mk("a@x", "2026-08-19T09:00:00", "晨会", { end: "2026-08-19T10:00:00", location: "会议室" }),
        mk("b@x", "2026-08-20", "纪念日", { allDay: true }),
      ],
      WEEK_START,
      WEEK_END,
      "markdown",
    );
    expect(r.text).toBe("**8月19日 周三**\n- 09:00-10:00 晨会 @会议室\n\n**8月20日 周四**\n- 全天 纪念日");
  });

  it("renders English headers and the All-day label when the UI language is en", () => {
    setLanguage("en");
    const r = buildAgendaText(
      [mk("a@x", "2026-08-19", "Anniversary", { allDay: true })],
      DAY_START,
      DAY_END,
      "plain",
    );
    expect(r.text).toBe("Wed, Aug 19\nAll-day Anniversary");
  });
});
