import { AgendaStats } from "../stats";

function renderCount(container: HTMLElement, label: string, value: number): void {
  const row = document.createElement("div");
  row.className = "ogenda-stat-row";
  const k = document.createElement("span");
  k.className = "ogenda-stat-label";
  k.textContent = label;
  const v = document.createElement("span");
  v.className = "ogenda-stat-value";
  v.textContent = String(value);
  row.appendChild(k);
  row.appendChild(v);
  container.appendChild(row);
}

function renderBreakdown(container: HTMLElement, title: string, counts: Record<string, number>): void {
  const section = document.createElement("div");
  section.className = "ogenda-stat-section";
  const heading = document.createElement("div");
  heading.className = "ogenda-stat-heading";
  heading.textContent = title;
  section.appendChild(heading);
  for (const [key, count] of Object.entries(counts)) {
    renderCount(section, key, count);
  }
  container.appendChild(section);
}

export function renderStatsView(container: HTMLElement, stats: AgendaStats): void {
  container.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "ogenda-stat-section";
  renderCount(summary, "本月事件总数", stats.total);
  renderCount(summary, "全天事件", stats.allDayCount);
  renderCount(summary, "定时事件", stats.timedCount);
  renderCount(summary, "循环事件", stats.recurringCount);
  renderCount(summary, "单次事件", stats.onceCount);
  renderCount(summary, "未同步到 iCloud", stats.unsyncedCount);
  container.appendChild(summary);

  renderBreakdown(container, "按状态分布", stats.byStatus);
  renderBreakdown(container, "按分类分布", stats.byCategory);

  const busiest = document.createElement("div");
  busiest.className = "ogenda-stat-section";
  const heading = document.createElement("div");
  heading.className = "ogenda-stat-heading";
  heading.textContent = "最忙的几天";
  busiest.appendChild(heading);
  for (const d of stats.busiestDays) {
    renderCount(busiest, d.date, d.count);
  }
  container.appendChild(busiest);
}
