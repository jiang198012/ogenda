// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { AgendaStats } from "../../../src/agenda-panel/stats";
import { renderStatsView } from "../../../src/agenda-panel/views/stats-view";
import { setLanguage } from "../../../src/i18n";

const mkStats = (o: Partial<AgendaStats> = {}): AgendaStats => ({
  total: 5,
  byStatus: { confirmed: 3, "": 2 },
  allDayCount: 1,
  timedCount: 4,
  recurringCount: 1,
  onceCount: 4,
  byCategory: { "工作": 2, "": 3 },
  busiestDays: [{ date: "2026-07-06", count: 3 }],
  unsyncedCount: 2,
  ...o,
});

beforeEach(() => setLanguage("zh"));

describe("renderStatsView (dashboard)", () => {
  it("renders four KPI cards: total / confirmed / tentative / unsynced", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.querySelectorAll(".ogenda-kpi").length).toBe(4);
    expect(container.textContent).toContain("本月事件");
    expect(container.textContent).toContain("已确认");
    expect(container.textContent).toContain("未同步");
    const nums = [...container.querySelectorAll(".ogenda-kpi-num")].map((n) => n.textContent);
    expect(nums).toEqual(["5", "3", "0", "2"]); // total, confirmed, tentative(0), unsynced
  });

  it("flags the unsynced KPI with a warning modifier", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.querySelector(".ogenda-kpi-warn")).not.toBeNull();
  });

  it("renders one status distribution bar per bucket with Chinese labels + counts", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    const rows = container.querySelectorAll(".ogenda-stat-bar-row");
    expect(rows.length).toBe(2); // confirmed + 未设置
    expect(container.textContent).toContain("已确认");
    expect([...container.querySelectorAll(".ogenda-stat-bar-count")].map((c) => c.textContent)).toEqual(["3", "2"]);
  });

  it("renders one category chip per bucket", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.querySelectorAll(".ogenda-cat-chip").length).toBe(2);
    const chips = container.querySelector(".ogenda-cat-chips")!;
    expect(chips.textContent).toContain("工作");
    expect(chips.textContent).toContain("未分类");
  });

  it("renders bottom mini-metrics: all-day/timed, recurring, busiest day", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.querySelectorAll(".ogenda-stat-mini").length).toBe(3);
    const vals = [...container.querySelectorAll(".ogenda-stat-mini-val")].map((v) => v.textContent);
    expect(vals).toEqual(["1 / 4", "1", "2026-07-06 · 3 个"]);
  });

  it("shows an em dash for busiest day when there are no events", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats({ busiestDays: [] }));
    const vals = [...container.querySelectorAll(".ogenda-stat-mini-val")].map((v) => v.textContent);
    expect(vals[2]).toBe("—");
  });
});
