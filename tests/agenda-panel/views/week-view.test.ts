// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderWeekView } from "../../../src/agenda-panel/views/week-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
import { setLanguage } from "../../../src/i18n";
import { TimeSegment } from "../../../src/agenda-panel/time-segments";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

beforeEach(() => setLanguage("zh"));

describe("renderWeekView", () => {
  it("renders 7 day columns, each with its own events", () => {
    const container = document.createElement("div");
    const occs: EventOccurrence[] = [mkOcc("2026-07-13T14:00:00", "周一的会"), mkOcc("2026-07-18T09:00:00", "周六的会")];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {}); // anchor = Wed of that week

    const cols = container.querySelectorAll(".ogenda-week-col");
    expect(cols.length).toBe(7);
    expect(container.textContent).toContain("周一的会");
    expect(container.textContent).toContain("周六的会");
  });

  it("puts events in the correct column by day, not just anywhere", () => {
    const container = document.createElement("div");
    renderWeekView(container, [mkOcc("2026-07-18T09:00:00", "周六的会")], new Date(2026, 6, 15), () => {});
    const cols = container.querySelectorAll(".ogenda-week-col");
    // Monday-first: index 0=Mon(13) .. 5=Sat(18) .. 6=Sun(19)
    expect(cols[5].textContent).toContain("周六的会");
    expect(cols[0].textContent).not.toContain("周六的会");
  });

  it("positions a timed event inside its day's time grid", () => {
    const container = document.createElement("div");
    renderWeekView(container, [mkOcc("2026-07-13T14:00:00", "周一的会")], new Date(2026, 6, 15), () => {});
    const block = container.querySelector(".ogenda-week-block") as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.style.top).toBe("392px"); // 14h * 28px
  });

  it("calls onEventClick with the underlying occurrence", () => {
    const container = document.createElement("div");
    const occ = mkOcc("2026-07-13T14:00:00", "周一的会");
    const onClick = vi.fn();
    renderWeekView(container, [occ], new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-week-block") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ);
  });

  it("routes an empty-area click to handlers.onSlotClick with the day", () => {
    const container = document.createElement("div");
    const onSlot = vi.fn();
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}, { onSlotClick: onSlot });
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    const down = new PointerEvent("pointerdown", { pointerType: "mouse", pointerId: 1, bubbles: true });
    const up = new PointerEvent("pointerup", { pointerType: "mouse", pointerId: 1, bubbles: true });
    grid.dispatchEvent(down);
    document.dispatchEvent(up);
    expect(onSlot).toHaveBeenCalled();
  });

  it("does NOT call onSlotClick when a block inside the column is clicked", () => {
    const container = document.createElement("div");
    const onSlot = vi.fn();
    const onEventClick = vi.fn();
    renderWeekView(container, [mkOcc("2026-07-13T14:00:00", "周一的会")], new Date(2026, 6, 15), onEventClick, { onSlotClick: onSlot });
    (container.querySelector(".ogenda-week-block") as HTMLElement).click();
    expect(onEventClick).toHaveBeenCalled();
    expect(onSlot).not.toHaveBeenCalled();
  });

  it("colors a block's left bar from the event category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "会", start: "2026-07-13T14:00:00", category: "工作", origin: "synced" },
      start: "2026-07-13T14:00:00",
    };
    renderWeekView(container, [occ], new Date(2026, 6, 15), () => {}, {}, createColorResolver());
    const card = container.querySelector(".ogenda-week-block") as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe("");
  });

  it("colors each weekday header, with weekend distinct from a weekday", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    const heads = container.querySelectorAll(".ogenda-week-col-head");
    const mon = (heads[0] as HTMLElement).style.color;
    const sat = (heads[5] as HTMLElement).style.color;
    expect(mon).not.toBe("");
    expect(sat).not.toBe("");
    expect(mon).not.toBe(sat);
  });

  it("renders an empty week without throwing and shows 7 empty columns (T5.7)", () => {
    const container = document.createElement("div");
    expect(() => renderWeekView(container, [], new Date(2026, 6, 15), () => {})).not.toThrow();
    expect(container.querySelectorAll(".ogenda-week-col").length).toBe(7);
    expect(container.querySelectorAll(".ogenda-week-block").length).toBe(0);
  });

  it("renders a multi-day all-day event as one through-bar, not per-day chips (T5.9)", () => {
    const container = document.createElement("div");
    // expandOccurrences 的真实切片:每天一片,end 为排他日期
    const occs: EventOccurrence[] = [
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-13", end: "2026-07-14" },
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-14", end: "2026-07-15" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    // 顶部贯通横条区恰好一条横条,跨周一~周二两列(grid 列线 1/3)
    const bars = container.querySelectorAll(".ogenda-week-span");
    expect(bars.length).toBe(1);
    const bar = bars[0] as HTMLElement;
    expect(bar.textContent).toContain("出差");
    expect(bar.style.gridColumn).toBe("1 / 3");
    expect(bar.style.gridRow).toBe("1");
    expect(bar.title).toBe("7月13日 周一 → 7月14日 周二");
    // 横条在独立横条行内,不在任何天列里;列内也没有全天 chip
    expect(container.querySelector(".ogenda-week-col .ogenda-week-span")).toBeNull();
    expect(container.querySelectorAll(".ogenda-week-alldaycell").length).toBe(0);
    expect(container.querySelector(".ogenda-week-col .ogenda-week-allday-chip")).toBeNull();
  });

  it("renders a single-day all-day event as a one-column bar", () => {
    const container = document.createElement("div");
    const occs: EventOccurrence[] = [
      { event: { uid: "a", title: "纪念日", start: "2026-07-14", allDay: true, origin: "synced" }, start: "2026-07-14" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const bar = container.querySelector(".ogenda-week-span") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.gridColumn).toBe("2 / 3"); // 只在周二列
    expect(bar.title).toBe("全天");
  });

  it("renders a cross-midnight event as a through-bar instead of filling both columns (T5.8)", () => {
    const container = document.createElement("div");
    // 22:00 周一 → 01:00 周二:expandOccurrences 切成两片,午夜相接
    const occs: EventOccurrence[] = [
      { event: { uid: "a", title: "夜班", start: "2026-07-13T22:00:00", end: "2026-07-14T01:00:00", origin: "synced" }, start: "2026-07-13T22:00:00", end: "2026-07-14T00:00:00" },
      { event: { uid: "a", title: "夜班", start: "2026-07-13T22:00:00", end: "2026-07-14T01:00:00", origin: "synced" }, start: "2026-07-14T00:00:00", end: "2026-07-14T01:00:00" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const bars = container.querySelectorAll(".ogenda-week-span");
    expect(bars.length).toBe(1);
    expect((bars[0] as HTMLElement).style.gridColumn).toBe("1 / 3"); // 周一~周二
    expect(bars[0].textContent).toContain("夜班");
    // 两片都进了横条区,时间格里一个块都没有
    expect(container.querySelectorAll(".ogenda-week-block").length).toBe(0);
  });

  it("keeps a multi-day timed event out of the grid and does not stretch the window to 24h", () => {
    const container = document.createElement("div");
    const trip: EventOccurrence[] = [
      { event: { uid: "t", title: "团建", start: "2026-07-14T09:00:00", end: "2026-07-16T18:00:00", origin: "synced" }, start: "2026-07-14T09:00:00", end: "2026-07-15T00:00:00" },
      { event: { uid: "t", title: "团建", start: "2026-07-14T09:00:00", end: "2026-07-16T18:00:00", origin: "synced" }, start: "2026-07-15T00:00:00", end: "2026-07-16T00:00:00" },
      { event: { uid: "t", title: "团建", start: "2026-07-14T09:00:00", end: "2026-07-16T18:00:00", origin: "synced" }, start: "2026-07-16T00:00:00", end: "2026-07-16T18:00:00" },
    ];
    const segments: TimeSegment[] = [
      { name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true },
    ];
    renderWeekView(container, trip, new Date(2026, 6, 15), () => {}, {}, undefined, undefined, segments);
    const bar = container.querySelector(".ogenda-week-span") as HTMLElement;
    expect(bar.style.gridColumn).toBe("2 / 5"); // 周二~周四
    // 中间那天(周三)不再被 00:00–24:00 填满:三片都不在时间格
    expect(container.querySelectorAll(".ogenda-week-block").length).toBe(0);
    // 窗口仍是分区窗口 06:00–12:00,没被跨天事件撑成 24 小时
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    expect(grid.style.height).toBe("168px"); // 6h * 28px
  });

  it("stacks overlapping through-bars into separate lanes and reuses a lane when disjoint", () => {
    const container = document.createElement("div");
    const ev = (uid: string, title: string, start: string, end: string): EventOccurrence => ({
      event: { uid, title, start, end, allDay: true, origin: "synced" }, start, end,
    });
    const occs: EventOccurrence[] = [
      ev("a", "A", "2026-07-13", "2026-07-16"), // 周一~周三
      ev("b", "B", "2026-07-14", "2026-07-17"), // 周二~周四(与 A 重叠)
      ev("c", "C", "2026-07-16", "2026-07-18"), // 周四~周五(与 A 不重叠 → 复用 lane 0)
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const bars = [...container.querySelectorAll(".ogenda-week-span")] as HTMLElement[];
    const byTitle: Record<string, HTMLElement> = {};
    for (const b of bars) byTitle[b.textContent ?? ""] = b;
    expect(byTitle.A.style.gridRow).toBe("1");
    expect(byTitle.B.style.gridRow).toBe("2");
    expect(byTitle.C.style.gridRow).toBe("1");
  });

  it("squares off the bar edge that continues past the week boundary", () => {
    const container = document.createElement("div");
    const occs: EventOccurrence[] = [
      // 上周日开始,拖到本周二:左端被周界截断
      { event: { uid: "p", title: "上周来", start: "2026-07-12T10:00:00", end: "2026-07-14T17:00:00", origin: "synced" }, start: "2026-07-13T00:00:00", end: "2026-07-14T00:00:00" },
      { event: { uid: "p", title: "上周来", start: "2026-07-12T10:00:00", end: "2026-07-14T17:00:00", origin: "synced" }, start: "2026-07-14T00:00:00", end: "2026-07-14T17:00:00" },
      // 本周六开始,拖到下周一:右端被周界截断
      { event: { uid: "n", title: "到下周", start: "2026-07-18T09:00:00", end: "2026-07-20T12:00:00", origin: "synced" }, start: "2026-07-18T09:00:00", end: "2026-07-19T00:00:00" },
      { event: { uid: "n", title: "到下周", start: "2026-07-18T09:00:00", end: "2026-07-20T12:00:00", origin: "synced" }, start: "2026-07-19T00:00:00", end: "2026-07-20T00:00:00" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const bars = [...container.querySelectorAll(".ogenda-week-span")] as HTMLElement[];
    const byTitle: Record<string, HTMLElement> = {};
    for (const b of bars) byTitle[b.textContent ?? ""] = b;
    expect(byTitle["上周来"].classList.contains("ogenda-week-span-prev")).toBe(true);
    expect(byTitle["上周来"].classList.contains("ogenda-week-span-next")).toBe(false);
    expect(byTitle["上周来"].style.gridColumn).toBe("1 / 3"); // 截断到周一~周二
    expect(byTitle["到下周"].classList.contains("ogenda-week-span-next")).toBe(true);
    expect(byTitle["到下周"].classList.contains("ogenda-week-span-prev")).toBe(false);
    expect(byTitle["到下周"].style.gridColumn).toBe("6 / 8"); // 周六~周日(真实终点在下周一)
  });

  it("calls onEventClick when a through-bar is clicked", () => {
    const container = document.createElement("div");
    const occs: EventOccurrence[] = [
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-13", end: "2026-07-14" },
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-14", end: "2026-07-15" },
    ];
    const onClick = vi.fn();
    renderWeekView(container, occs, new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-week-span") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occs[0]);
  });

  it("paints configured time-line segments as translucent bands under events", () => {
    const container = document.createElement("div");
    const segments: TimeSegment[] = [
      { name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true },
    ];
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}, {}, undefined, undefined, segments);
    const seg = container.querySelector(".ogenda-time-segment") as HTMLElement;
    expect(seg).not.toBeNull();
    // 窗口 = 06:00–12:00:色块铺满窗口,top 从 0 开始
    expect(seg.style.top).toBe("0px");
    expect(seg.style.height).toBe("168px"); // 6h * 28px
    expect(seg.style.background).toContain("rgba(59, 130, 246");
  });

  it("shows only the configured segment window: nothing before/after it (default 6-seg spec)", () => {
    const container = document.createElement("div");
    const segments: TimeSegment[] = [
      { name: "清晨", start: "06:00", end: "08:30", color: "#5B6B8C", enabled: true },
      { name: "上午", start: "08:30", end: "12:00", color: "#3B82F6", enabled: true },
      { name: "中午", start: "12:00", end: "14:00", color: "#EAB308", enabled: true },
      { name: "下午", start: "14:00", end: "17:00", color: "#F59E0B", enabled: true },
      { name: "傍晚", start: "17:00", end: "20:00", color: "#F97316", enabled: true },
      { name: "晚上", start: "20:00", end: "23:00", color: "#8B5CF6", enabled: true },
    ];
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}, {}, undefined, undefined, segments);
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    // 窗口 06:00–23:00 = 17h × 28px = 476px(深夜不占空间)
    expect(grid.style.height).toBe("476px");
    // 每列 6 段(7 列共 42)
    const segs = [...container.querySelectorAll(".ogenda-time-segment")];
    expect(segs).toHaveLength(42);
    const col0Segs = [...container.querySelector(".ogenda-week-col")!.querySelectorAll(".ogenda-time-segment")] as HTMLElement[];
    expect(col0Segs).toHaveLength(6);
    // 第一段 06:00 在窗口顶部,最后一段 20:00–23:00 贴窗口底
    expect(col0Segs[0].style.top).toBe("0px");
    expect(col0Segs[5].style.top).toBe("392px"); // (20h - 6h) * 28px
    expect(col0Segs[5].style.height).toBe("84px"); // 3h * 28px
  });

  it("expands the window to show timed events outside the segment range (e.g. before 06:00)", () => {
    const container = document.createElement("div");
    const segments: TimeSegment[] = [
      { name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true },
    ];
    const night: EventOccurrence = { event: { uid: "n", title: "夜班", start: "2026-07-13T04:00:00", end: "2026-07-13T05:00:00", origin: "synced" }, start: "2026-07-13T04:00:00" };
    const morning: EventOccurrence = { event: { uid: "m", title: "早会", start: "2026-07-13T08:00:00", end: "2026-07-13T09:00:00", origin: "synced" }, start: "2026-07-13T08:00:00" };
    renderWeekView(container, [night, morning], new Date(2026, 6, 15), () => {}, {}, undefined, undefined, segments);
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    // 时间轴扩展到 04:00–12:00(分区窗口 06:00 起,被深夜事件拉长)
    expect(grid.style.height).toBe("224px"); // 8h * 28px
    const blocks = [...container.querySelectorAll(".ogenda-week-block")];
    expect(blocks.length).toBe(2);
    const nightBlock = blocks.find((b) => b.textContent.includes("夜班")) as HTMLElement;
    expect(nightBlock.style.top).toBe("0px");
    const morningBlock = blocks.find((b) => b.textContent.includes("早会")) as HTMLElement;
    expect(morningBlock.style.top).toBe("112px"); // (8h - 4h) * 28px
  });

  it("keeps the full 24h grid when no segments are configured", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    const grid = container.querySelector(".ogenda-timegrid") as HTMLElement;
    expect(grid.style.height).toBe("672px"); // 24h * 28px
  });

  it("draws three through-running timeline labels/lines at 06:00/12:00/18:00", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    const labels = [...container.querySelectorAll(".ogenda-week-timelabel")] as HTMLElement[];
    expect(labels.map((l) => l.textContent)).toEqual(["06:00", "12:00", "18:00"]);
    // 数字在线下方 1 小时(28px)处,不与线重叠
    expect(labels[0].style.top).toBe("196px"); // 6h * 28px + 28px
    expect(labels[1].style.top).toBe("364px");
    expect(labels[2].style.top).toBe("532px");
    const lines = [...container.querySelectorAll(".ogenda-week-timeline")] as HTMLElement[];
    expect(lines).toHaveLength(3);
    expect(lines[0].style.top).toBe("168px"); // 线本身仍在 6h * 28px
    // 贯通线在事件/色块下方(低 z-index),且不在任何列内部
    expect(container.querySelectorAll(".ogenda-week-col .ogenda-week-timeline").length).toBe(0);
    // 列内保留整点小时线(每小时都有,窗口 24h 时单列 23 条)
    const firstColGrid = container.querySelector(".ogenda-week-col .ogenda-timegrid") as HTMLElement;
    expect(firstColGrid.querySelectorAll(".ogenda-timegrid-hourline").length).toBe(23);
  });

  it("shifts the through-lines when the week window is extended by a night event", () => {
    const container = document.createElement("div");
    const segments: TimeSegment[] = [
      { name: "上午", start: "06:00", end: "12:00", color: "#3B82F6", enabled: true },
    ];
    const night: EventOccurrence = { event: { uid: "n", title: "夜班", start: "2026-07-13T02:00:00", end: "2026-07-13T04:00:00", origin: "synced" }, start: "2026-07-13T02:00:00" };
    renderWeekView(container, [night], new Date(2026, 6, 15), () => {}, {}, undefined, undefined, segments);
    const labels = [...container.querySelectorAll(".ogenda-week-timelabel")] as HTMLElement[];
    // 分区窗口 06:00 起,被 02:00 夜班拉到 02:00 → 06:00 线在 (6-2)h*28 = 112px,
    // 标签在其下方 1 小时(28px)处
    expect(labels[0].textContent).toBe("06:00");
    expect(labels[0].style.top).toBe("140px");
    const lines = [...container.querySelectorAll(".ogenda-week-timeline")] as HTMLElement[];
    expect(lines[0].style.top).toBe("112px");
    // 所有列共用同一窗口(统一高度),贯通线跨整行
    const cols = [...container.querySelectorAll(".ogenda-week-col")];
    const heights = [...new Set(cols.map((c) => (c.querySelector(".ogenda-timegrid") as HTMLElement).style.height))];
    expect(heights).toHaveLength(1);
  });

  it("paints no segment bands when segments are disabled or empty", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    expect(container.querySelectorAll(".ogenda-time-segment").length).toBe(0);
    const container2 = document.createElement("div");
    renderWeekView(container2, [], new Date(2026, 6, 15), () => {}, {}, undefined, undefined, [
      { name: "x", start: "00:00", end: "06:00", color: "#111111", enabled: false },
    ]);
    expect(container2.querySelectorAll(".ogenda-time-segment").length).toBe(0);
  });
});
