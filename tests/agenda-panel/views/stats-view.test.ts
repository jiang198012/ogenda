// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { AgendaStats } from "../../../src/agenda-panel/stats";
import { renderStatsView } from "../../../src/agenda-panel/views/stats-view";

const mkStats = (o: Partial<AgendaStats> = {}): AgendaStats => ({
  total: 5,
  byStatus: { confirmed: 3, "未设置": 2 },
  allDayCount: 1,
  timedCount: 4,
  recurringCount: 1,
  onceCount: 4,
  byCategory: { "工作": 2, "未分类": 3 },
  busiestDays: [{ date: "2026-07-06", count: 3 }],
  unsyncedCount: 2,
  ...o,
});

describe("renderStatsView", () => {
  it("renders the summary counts", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.textContent).toContain("本月事件总数");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("未同步到 iCloud");
    expect(container.textContent).toContain("2");
  });

  it("renders one row per status bucket and per category bucket", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.textContent).toContain("confirmed");
    expect(container.textContent).toContain("未设置");
    expect(container.textContent).toContain("工作");
    expect(container.textContent).toContain("未分类");
  });

  it("renders the busiest-days list", () => {
    const container = document.createElement("div");
    renderStatsView(container, mkStats());
    expect(container.textContent).toContain("2026-07-06");
  });
});
