// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { renderDayView } from "../../../src/agenda-panel/views/day-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
import { setLanguage } from "../../../src/i18n";
import { TimeSegment } from "../../../src/agenda-panel/time-segments";

beforeEach(() => setLanguage("zh"));

const ANCHOR = new Date(2026, 6, 16);

describe("renderDayView", () => {
  it("renders a compact title-only label (no time row) and no sync metadata", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "团队周会", start: "2026-07-16T14:00:00", end: "2026-07-16T15:00:00",
      allDay: false, location: "会议室 A",
      origin: "synced", href: "https://example.com/a.ics", etag: '"e1"',
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start, end: ev.end }], () => {}, undefined, {}, ANCHOR);

    expect(container.textContent).toContain("团队周会");
    // 紧凑标签:块内只有标题,时间由时间格位置表达(刻度仍显示,但不属于块)
    const blockText = (container.querySelector(".ogenda-day-block") as HTMLElement).textContent ?? "";
    expect(blockText).not.toContain("14:00");
    expect(blockText).not.toContain("会议室 A");
    expect(container.textContent).not.toContain("https://example.com/a.ics");
    expect(container.textContent).not.toContain('"e1"');
  });

  it("puts an all-day event into the all-day strip", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "全员大会", start: "2026-07-16", allDay: true, origin: "synced" };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {}, undefined, {}, ANCHOR);
    expect(container.querySelector(".ogenda-day-allday-chip")?.textContent).toContain("全员大会");
    expect(container.querySelectorAll(".ogenda-day-block").length).toBe(0);
  });

  it("calls onEventClick with the underlying occurrence when a block is clicked", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "会议", start: "2026-07-16T14:00:00", origin: "synced" };
    const container = document.createElement("div");
    const occ = { event: ev, start: ev.start };
    const onClick = vi.fn();
    renderDayView(container, [occ], onClick, undefined, {}, ANCHOR);
    (container.querySelector(".ogenda-day-block") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ);
  });

  it("colors the block's left bar from the category", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "评审会", start: "2026-07-16T14:00:00", category: "工作", origin: "synced",
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {}, createColorResolver(), {}, ANCHOR);
    const block = container.querySelector(".ogenda-day-block") as HTMLElement;
    expect(block.style.borderLeftColor).not.toBe("");
  });

  it("positions a block by its start and end minutes", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "会议", start: "2026-07-16T09:30:00", end: "2026-07-16T10:15:00", origin: "synced" };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start, end: ev.end }], () => {}, undefined, {}, ANCHOR);
    const block = container.querySelector(".ogenda-day-block") as HTMLElement;
    expect(block.style.top).toBe("380px"); // 9.5h * 40px
    expect(block.style.height).toBe("30px"); // 45 min * 40px / 60
  });

  it("renders an empty day without throwing and shows no blocks", () => {
    const container = document.createElement("div");
    expect(() => renderDayView(container, [], () => {}, undefined, {}, ANCHOR)).not.toThrow();
    expect(container.querySelectorAll(".ogenda-day-block").length).toBe(0);
  });

  it("shows only the configured segment window (nothing before 06:00, nothing after 23:00)", () => {
    const segments: TimeSegment[] = [
      { name: "清晨", start: "06:00", end: "08:30", color: "#14B8A6", enabled: true },
      { name: "上午", start: "08:30", end: "12:00", color: "#3B82F6", enabled: true },
      { name: "中午", start: "12:00", end: "14:00", color: "#EAB308", enabled: true },
      { name: "下午", start: "14:00", end: "17:00", color: "#EC4899", enabled: true },
      { name: "傍晚", start: "17:00", end: "20:00", color: "#F97316", enabled: true },
      { name: "晚上", start: "20:00", end: "23:00", color: "#8B5CF6", enabled: true },
    ];
    const container = document.createElement("div");
    renderDayView(container, [], () => {}, undefined, {}, ANCHOR, segments);
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    // 窗口 06:00–23:00 = 17h × 40px = 680px(深夜不占空间)
    expect(grid.style.height).toBe("680px");
    // 刻度只显示窗口内的整点:06:00 … 23:00
    const labels = [...container.querySelectorAll(".ogenda-timegrid-hourlabel")].map((l) => l.textContent);
    expect(labels[0]).toBe("06:00");
    expect(labels[labels.length - 1]).toBe("23:00");
    expect(labels).not.toContain("05:00");
    expect(labels).not.toContain("00:00");
  });

  it("expands the window to show timed events outside the segment range (e.g. night shift at 04:00)", () => {
    const segments: TimeSegment[] = [{ name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true }];
    const container = document.createElement("div");
    const night: AgendaEvent = { uid: "n", title: "夜班", start: "2026-07-16T04:00:00", end: "2026-07-16T05:30:00", origin: "synced" };
    const morning: AgendaEvent = { uid: "m", title: "早会", start: "2026-07-16T08:00:00", end: "2026-07-16T09:00:00", origin: "synced" };
    renderDayView(
      container,
      [
        { event: night, start: night.start, end: night.end },
        { event: morning, start: morning.start, end: morning.end },
      ],
      () => {},
      undefined,
      {},
      ANCHOR,
      segments,
    );
    // 时间轴扩展到 04:00–12:00(分区窗口 06:00 起,被深夜事件拉长)
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    expect(grid.style.height).toBe("320px"); // 8h * 40px
    const blocks = [...container.querySelectorAll(".ogenda-day-block")];
    expect(blocks.length).toBe(2);
    const nightBlock = blocks.find((b) => b.textContent.includes("夜班")) as HTMLElement;
    // 04:00 事件在窗口顶(相对 0px),不再被藏起来
    expect(nightBlock.style.top).toBe("0px");
    expect(nightBlock.style.height).toBe("60px"); // 1.5h * 40px
    const morningBlock = blocks.find((b) => b.textContent.includes("早会")) as HTMLElement;
    expect(morningBlock.style.top).toBe("160px"); // (8h - 4h) * 40px
  });

  it("keeps the full 24h grid when no segments are configured", () => {
    const container = document.createElement("div");
    renderDayView(container, [], () => {}, undefined, {}, ANCHOR);
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    expect(grid.style.height).toBe("960px"); // 24h * 40px
  });
});
