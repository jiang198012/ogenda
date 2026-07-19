import { AgendaStats } from "../stats";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";
import { t } from "../../i18n";

const STATUS_ORDER = ["confirmed", "tentative", "cancelled"];

function addKpi(row: HTMLElement, num: number, label: string, opts: { warn?: boolean; color?: string } = {}): void {
  const card = document.createElement("div");
  card.className = "ogenda-kpi" + (opts.warn ? " ogenda-kpi-warn" : "");
  const n = document.createElement("div");
  n.className = "ogenda-kpi-num";
  n.textContent = String(num);
  if (opts.color) n.style.color = opts.color;
  const l = document.createElement("div");
  l.className = "ogenda-kpi-label";
  l.textContent = label;
  card.appendChild(n);
  card.appendChild(l);
  row.appendChild(card);
}

function orderedStatusKeys(byStatus: Record<string, number>): string[] {
  const known = STATUS_ORDER.filter((k) => k in byStatus);
  const others = Object.keys(byStatus).filter((k) => !STATUS_ORDER.includes(k)).sort();
  return [...known, ...others];
}

export function renderStatsView(
  container: HTMLElement,
  stats: AgendaStats,
  colors: ColorResolver = createColorResolver(),
): void {
  container.innerHTML = "";

  // ① KPI row
  const kpis = document.createElement("div");
  kpis.className = "ogenda-stat-kpis";
  addKpi(kpis, stats.total, t("stats.total"));
  addKpi(kpis, stats.byStatus["confirmed"] ?? 0, t("stats.confirmed"), { color: statusStyle("confirmed").text });
  addKpi(kpis, stats.byStatus["tentative"] ?? 0, t("stats.tentative"), { color: statusStyle("tentative").text });
  addKpi(kpis, stats.unsyncedCount, t("stats.unsynced"), { warn: true, color: "var(--text-error)" });
  container.appendChild(kpis);

  // ② Status distribution bars
  const statusCard = document.createElement("div");
  statusCard.className = "ogenda-stat-card";
  const statusTitle = document.createElement("div");
  statusTitle.className = "ogenda-stat-card-title";
  statusTitle.textContent = t("stats.statusDist");
  statusCard.appendChild(statusTitle);
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  for (const key of orderedStatusKeys(stats.byStatus)) {
    const count = stats.byStatus[key];
    const style = statusStyle(key);
    const row = document.createElement("div");
    row.className = "ogenda-stat-bar-row";
    const label = document.createElement("span");
    label.className = "ogenda-stat-bar-label";
    label.textContent = style.label;
    label.style.color = style.text;
    const track = document.createElement("div");
    track.className = "ogenda-stat-bar-track";
    const fill = document.createElement("div");
    fill.className = "ogenda-stat-bar-fill";
    fill.style.width = `${Math.round((count / maxStatus) * 100)}%`;
    fill.style.background = style.text;
    track.appendChild(fill);
    const c = document.createElement("span");
    c.className = "ogenda-stat-bar-count";
    c.textContent = String(count);
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(c);
    statusCard.appendChild(row);
  }
  container.appendChild(statusCard);

  // ③ Category chips
  const catCard = document.createElement("div");
  catCard.className = "ogenda-stat-card";
  const catTitle = document.createElement("div");
  catTitle.className = "ogenda-stat-card-title";
  catTitle.textContent = t("stats.categoryDist");
  catCard.appendChild(catTitle);
  const chips = document.createElement("div");
  chips.className = "ogenda-cat-chips";
  for (const [name, count] of Object.entries(stats.byCategory)) {
    const chip = document.createElement("span");
    chip.className = "ogenda-cat-chip";
    const bar = document.createElement("span");
    bar.className = "ogenda-cat-chip-bar";
    bar.style.background = colors.category(name);
    const nm = document.createElement("span");
    nm.textContent = name === "" ? t("stats.uncategorized") : name;
    const cc = document.createElement("span");
    cc.className = "ogenda-cat-chip-count";
    cc.textContent = String(count);
    chip.appendChild(bar);
    chip.appendChild(nm);
    chip.appendChild(cc);
    chips.appendChild(chip);
  }
  catCard.appendChild(chips);
  container.appendChild(catCard);

  // ④ Bottom mini-metrics
  const minis = document.createElement("div");
  minis.className = "ogenda-stat-minis";
  const addMini = (label: string, val: string) => {
    const m = document.createElement("div");
    m.className = "ogenda-stat-mini";
    const l = document.createElement("div");
    l.className = "ogenda-stat-mini-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "ogenda-stat-mini-val";
    v.textContent = val;
    m.appendChild(l);
    m.appendChild(v);
    minis.appendChild(m);
  };
  addMini(t("stats.allDayTimed"), `${stats.allDayCount} / ${stats.timedCount}`);
  addMini(t("stats.recurring"), String(stats.recurringCount));
  const busiest = stats.busiestDays[0];
  addMini(t("stats.busiest"), busiest ? t("stats.busiestValue", { date: busiest.date, count: busiest.count }) : "—");
  container.appendChild(minis);
}
