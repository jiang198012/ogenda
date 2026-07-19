# ogenda v3-UI 计划二:周/月视图配色 + 统计仪表盘 + 多月迷你日历 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v3-UI 视觉语言套用到剩余视图——周/月格子事件着分类色条、统计页改为卡片式仪表盘、日视图右栏迷你日历升级为**多月纵向填满 + 事件标点**(#47)。

**Architecture:** 复用计划一产出的 `colors.ts`(`ColorResolver`)、`date-format.ts`(`formatChineseMonth`)、`styles.css`(已含仪表盘/多月迷你日历的类)。周/月视图渲染函数新增可选尾参 `colors`;统计视图重写为 KPI 卡 + 状态条形图 + 分类色块 + 底部小指标;迷你日历新增纯函数 `monthsToFill` / `daysWithEvents`,渲染多月并在有事件的日子标点。面板 `render()` 相应接线(传 `colors`、按 `daySide` 高度算月数、按更宽范围展开事件算标点)。

**Tech Stack:** TypeScript、Obsidian API、vitest + jsdom、esbuild。

**依赖:** 必须先完成**计划一**(`colors.ts` / `date-format.ts` / `styles.css` 已就位,面板 `render()` 内已声明 `colors` 变量)。本计划自身即可交付:全部五个视图统一新样式,日视图右栏被多月迷你日历填满。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**。
- **字号 em 相对体系**;**分类色**用 `ColorResolver.category()`(计划一,10 色板 hash 派色);**状态色/中文标签**用 `statusStyle()`(计划一)。
- **中文月标题** `2026年7月` 用 `formatChineseMonth()`(计划一)。
- 视图渲染函数的 `colors` 一律**可选尾参**默认 `createColorResolver({})`,保持既有测试零改动。
- **测试命令** `node node_modules/vitest/vitest.mjs run <path>`;**构建** `npm run build`。
- **提交信息末尾**:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: 周/月视图事件着分类色条

**Files:**
- Modify: `src/agenda-panel/views/week-view.ts`
- Modify: `src/agenda-panel/views/month-view.ts`
- Modify(新增用例): `tests/agenda-panel/views/week-view.test.ts`、`tests/agenda-panel/views/month-view.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `ColorResolver`、`createColorResolver`(计划一)。
- Produces:
  - `renderWeekView(container, occurrences, anchor, onEventClick, onEmptyClick?, colors?)` —— 周卡片左边框着分类色。
  - `renderMonthView(container, occurrences, anchor, onEventClick, onEmptyClick?, colors?)` —— 月格子内事件条左边框着分类色。

> `colors` 作为第 6 个可选参数,既有周/月测试(4–5 个实参)全部照常通过,无需改旧断言;仅各加 1 个配色新用例。

- [ ] **Step 1: 加失败用例(周 + 月各一)**

在 `tests/agenda-panel/views/week-view.test.ts` 顶部 import 增加:

```ts
import { createColorResolver } from "../../../src/agenda-panel/colors";
```

在其 `describe` 末尾追加:

```ts
  it("colors a card's left bar from the event category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "会", start: "2026-07-13T14:00:00", category: "工作", origin: "synced" },
      start: "2026-07-13T14:00:00",
    };
    renderWeekView(container, [occ], new Date(2026, 6, 15), () => {}, undefined, createColorResolver({}));
    const card = container.querySelector(".ogenda-week-card") as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe("");
  });
```

在 `tests/agenda-panel/views/month-view.test.ts` 顶部 import 增加:

```ts
import { createColorResolver } from "../../../src/agenda-panel/colors";
```

在其 `describe` 末尾追加:

```ts
  it("colors a mini-title's left bar from the event category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "早会", start: "2026-07-06T09:00:00", category: "工作", origin: "synced" },
      start: "2026-07-06T09:00:00",
    };
    renderMonthView(container, [occ], new Date(2026, 6, 15), () => {}, undefined, createColorResolver({}));
    const mini = container.querySelector(".ogenda-month-mini") as HTMLElement;
    expect(mini.style.borderLeftColor).not.toBe("");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/week-view.test.ts tests/agenda-panel/views/month-view.test.ts`
Expected: FAIL —— 两个新用例断言 `borderLeftColor` 非空,但当前实现未按分类设色(且 `renderWeekView`/`renderMonthView` 尚无第 6 参,TS 编译报参数过多)。

- [ ] **Step 3: 重写 week-view.ts**

整体替换 `src/agenda-panel/views/week-view.ts`:

```ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { startOfWeek, startOfDay, addDays } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  return occ.start.slice(11, 16);
}

export function renderWeekView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
  colors: ColorResolver = createColorResolver({}),
): void {
  container.innerHTML = "";
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const grid = document.createElement("div");
  grid.className = "ogenda-week-grid";

  const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  for (let i = 0; i < days.length; i++) {
    const head = document.createElement("div");
    head.className = "ogenda-week-col-head";
    head.textContent = `${weekdayLabels[i]} ${days[i].getDate()}`;
    grid.appendChild(head);
  }

  for (const day of days) {
    const col = document.createElement("div");
    col.className = "ogenda-week-col";
    if (onEmptyClick) {
      col.addEventListener("click", (e) => {
        if (e.target === col) onEmptyClick(day);
      });
    }

    const dayOccs = occurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
    for (const occ of dayOccs) {
      const card = document.createElement("div");
      card.className = "ogenda-week-card";
      card.style.borderLeftColor = colors.category(occ.event.category);
      card.addEventListener("click", () => onEventClick(occ.event));

      const time = document.createElement("div");
      time.className = "ogenda-week-card-time";
      time.textContent = formatTime(occ);
      card.appendChild(time);

      const title = document.createElement("div");
      title.className = "ogenda-week-card-title";
      title.textContent = occ.event.title;
      card.appendChild(title);

      if (occ.event.location) {
        const loc = document.createElement("div");
        loc.className = "ogenda-week-card-loc";
        loc.textContent = occ.event.location;
        card.appendChild(loc);
      }

      col.appendChild(card);
    }
    grid.appendChild(col);
  }
  container.appendChild(grid);
}
```

- [ ] **Step 4: 重写 month-view.ts**

整体替换 `src/agenda-panel/views/month-view.ts`:

```ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { monthGridWeeks, startOfDay } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";

export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
  colors: ColorResolver = createColorResolver({}),
): void {
  container.innerHTML = "";
  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();

  const grid = document.createElement("div");
  grid.className = "ogenda-month-grid";

  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-month-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-month-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-month-othermonth");
      if (onEmptyClick) {
        cell.addEventListener("click", (e) => {
          if (e.target === cell) onEmptyClick(day);
        });
      }

      const num = document.createElement("div");
      num.className = "ogenda-month-daynum";
      num.textContent = String(day.getDate());
      cell.appendChild(num);

      const dayOccs = occurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
      for (const occ of dayOccs) {
        const mini = document.createElement("div");
        mini.className = "ogenda-month-mini";
        mini.style.borderLeftColor = colors.category(occ.event.category);
        mini.textContent = occ.event.title;
        mini.addEventListener("click", () => onEventClick(occ.event));
        cell.appendChild(mini);
      }

      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
}
```

- [ ] **Step 5: 接线面板(周/月传 colors)**

在 `src/agenda-panel/agenda-panel-view.ts` 的 `render()` 里,把周/月渲染调用改为多传 `colors`:

```ts
        else if (this.tab === "week") renderWeekView(body, occurrences, this.anchor, onEventClick, onEmptyClick, colors);
        else renderMonthView(body, occurrences, this.anchor, onEventClick, onEmptyClick, colors);
```

- [ ] **Step 6: 跑测试 + 构建**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/week-view.test.ts tests/agenda-panel/views/month-view.test.ts`
Expected: PASS(含新配色用例 + 全部旧用例)。
Run: `npm run build`
Expected: 无报错。

- [ ] **Step 7: 提交**

```bash
git add src/agenda-panel/views/week-view.ts src/agenda-panel/views/month-view.ts tests/agenda-panel/views/week-view.test.ts tests/agenda-panel/views/month-view.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): week/month event chips colored by category

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 统计页仪表盘(KPI 卡 + 状态条形图 + 分类色块 + 底部小指标)

**Files:**
- Modify(整体重写): `src/agenda-panel/views/stats-view.ts`
- Modify(整体重写): `tests/agenda-panel/views/stats-view.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `AgendaStats`(既有,**不改** `stats.ts` 计算)、`ColorResolver`、`createColorResolver`、`statusStyle`(计划一)。
- Produces: `renderStatsView(container, stats, colors?)` —— ① KPI 大卡行(本月总数 / 已确认 / 待定 / 未同步-警示);② 状态分布横条形图;③ 分类分布色块 chip;④ 底部小指标(全天/带时间、循环、最忙一天)。

> 计算层 `AgendaStats` 已含全部所需字段(`total`/`byStatus`/`allDayCount`/`timedCount`/`recurringCount`/`byCategory`/`busiestDays`/`unsyncedCount`),仪表盘只渲染现有数据,**不动** `stats.ts`。`byStatus` 的键是原始状态值(`confirmed` 等)或 `未设置`(见 `computeStats`),故 KPI 用 `byStatus["confirmed"]`,条形图标签用 `statusStyle()`。

- [ ] **Step 1: 整体重写 stats-view.test.ts**

整体替换 `tests/agenda-panel/views/stats-view.test.ts`:

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/stats-view.test.ts`
Expected: FAIL(旧实现渲染的是 `.ogenda-stat-row` 数字堆,无 `.ogenda-kpi`/`.ogenda-stat-bar-row`/`.ogenda-cat-chip`/`.ogenda-stat-mini`)。

- [ ] **Step 3: 整体重写 stats-view.ts**

整体替换 `src/agenda-panel/views/stats-view.ts`:

```ts
import { AgendaStats } from "../stats";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";

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
  colors: ColorResolver = createColorResolver({}),
): void {
  container.innerHTML = "";

  // ① KPI row
  const kpis = document.createElement("div");
  kpis.className = "ogenda-stat-kpis";
  addKpi(kpis, stats.total, "本月事件");
  addKpi(kpis, stats.byStatus["confirmed"] ?? 0, "已确认", { color: statusStyle("confirmed").text });
  addKpi(kpis, stats.byStatus["tentative"] ?? 0, "待定", { color: statusStyle("tentative").text });
  addKpi(kpis, stats.unsyncedCount, "未同步", { warn: true, color: "var(--text-error)" });
  container.appendChild(kpis);

  // ② Status distribution bars
  const statusCard = document.createElement("div");
  statusCard.className = "ogenda-stat-card";
  const statusTitle = document.createElement("div");
  statusTitle.className = "ogenda-stat-card-title";
  statusTitle.textContent = "状态分布";
  statusCard.appendChild(statusTitle);
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));
  for (const key of orderedStatusKeys(stats.byStatus)) {
    const count = stats.byStatus[key];
    const style = statusStyle(key === "未设置" ? "" : key);
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
  catTitle.textContent = "分类分布";
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
    nm.textContent = name;
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
  addMini("全天 / 带时间", `${stats.allDayCount} / ${stats.timedCount}`);
  addMini("循环事件", String(stats.recurringCount));
  const busiest = stats.busiestDays[0];
  addMini("最忙一天", busiest ? `${busiest.date} · ${busiest.count} 个` : "—");
  container.appendChild(minis);
}
```

- [ ] **Step 4: 接线面板(统计传 colors)**

在 `src/agenda-panel/agenda-panel-view.ts` 的 `render()` 里,统计分支改为多传 `colors`:

```ts
        renderStatsView(body, computeStats(events, local, this.anchor), colors);
```

- [ ] **Step 5: 跑测试 + 构建**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/stats-view.test.ts`
Expected: PASS。
Run: `npm run build`
Expected: 无报错。

- [ ] **Step 6: 提交**

```bash
git add src/agenda-panel/views/stats-view.ts tests/agenda-panel/views/stats-view.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): stats dashboard — KPI cards + status bars + category chips + mini-metrics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 多月迷你日历(#47)—— 纵向填满 + 事件标点 + 中文月标题

**Files:**
- Modify(整体重写): `src/agenda-panel/mini-calendar.ts`
- Modify(新增用例): `tests/agenda-panel/mini-calendar.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `monthGridWeeks`、`startOfDay`、`toDateKey`(`date-grid`,既有);`formatChineseMonth`(计划一);`EventOccurrence`、`parseLocalDate`(既有)。
- Produces:
  - `function monthsToFill(availableHeightPx: number, perMonthPx?: number): number` —— 高度未知(≤0)返回 3;否则 `max(1, floor(h/perMonthPx))`,`perMonthPx` 默认 240。
  - `function daysWithEvents(occurrences: EventOccurrence[]): Set<string>` —— 有事件的日期键集合(`toDateKey`)。
  - `renderMiniCalendar(container, anchor, onDayClick, opts?: { monthCount?: number; eventDays?: Set<string> })` —— 渲染 `monthCount` 个月(默认 1,保持既有单月测试),仅当前月带选中高亮,有事件的日子标点,月标题中文。

> `opts` 默认 `{}`(monthCount=1、eventDays 空)→ 既有单月测试(35 cells、padding、selected、onDayClick)全部照常通过。面板在日视图分支按 `daySide.clientHeight` 算月数、按 `[当月1号, 当月+monthCount号)` 展开事件求标点。`clientHeight` 在 Electron 下读到真实高度,jsdom/首绘为 0 时 `monthsToFill` 回退 3。

- [ ] **Step 1: 加失败用例**

在 `tests/agenda-panel/mini-calendar.test.ts` 顶部 import 增加:

```ts
import { renderMiniCalendar, monthsToFill, daysWithEvents } from "../../src/agenda-panel/mini-calendar";
```
(替换原来只 import `renderMiniCalendar` 的那行。)

在 `describe` 末尾追加:

```ts
  it("monthsToFill: falls back to 3 when height is unknown, else fills by per-month height", () => {
    expect(monthsToFill(0)).toBe(3);
    expect(monthsToFill(-10)).toBe(3);
    expect(monthsToFill(720, 240)).toBe(3);
    expect(monthsToFill(500, 240)).toBe(2);
    expect(monthsToFill(100, 240)).toBe(1);
  });

  it("daysWithEvents: collects the date keys that carry events", () => {
    const set = daysWithEvents([
      { event: { uid: "a", title: "x", start: "2026-07-06T09:00:00", origin: "synced" }, start: "2026-07-06T09:00:00" },
      { event: { uid: "b", title: "y", start: "2026-07-20", origin: "synced" }, start: "2026-07-20" },
    ]);
    expect(set.has("2026-07-06")).toBe(true);
    expect(set.has("2026-07-20")).toBe(true);
    expect(set.has("2026-07-07")).toBe(false);
  });

  it("renders monthCount month blocks stacked vertically", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 3 });
    expect(container.querySelectorAll(".ogenda-mini-cal-month").length).toBe(3);
  });

  it("marks a dot on days that have events", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { eventDays: new Set(["2026-07-06"]) });
    expect(container.querySelectorAll(".ogenda-mini-cal-dot").length).toBe(1);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/mini-calendar.test.ts`
Expected: FAIL(`monthsToFill`/`daysWithEvents` 未导出;无 `.ogenda-mini-cal-month`/`.ogenda-mini-cal-dot`)。

- [ ] **Step 3: 整体重写 mini-calendar.ts**

整体替换 `src/agenda-panel/mini-calendar.ts`:

```ts
import { monthGridWeeks, startOfDay, toDateKey } from "./date-grid";
import { formatChineseMonth } from "./date-format";
import { EventOccurrence, parseLocalDate } from "./occurrences";

/** How many months fit in the sidebar. Unknown height (≤0) → show a few; else fill by per-month height. */
export function monthsToFill(availableHeightPx: number, perMonthPx = 240): number {
  if (!(availableHeightPx > 0)) return 3;
  return Math.max(1, Math.floor(availableHeightPx / perMonthPx));
}

/** The set of date keys (YYYY-MM-DD) that carry at least one event occurrence. */
export function daysWithEvents(occurrences: EventOccurrence[]): Set<string> {
  const set = new Set<string>();
  for (const occ of occurrences) {
    set.add(toDateKey(startOfDay(parseLocalDate(occ.start))));
  }
  return set;
}

interface MiniCalOpts {
  monthCount?: number;
  eventDays?: Set<string>;
}

function renderOneMonth(
  wrap: HTMLElement,
  monthAnchor: Date,
  selected: Date | null,
  eventDays: Set<string>,
  onDayClick: (day: Date) => void,
): void {
  const monthEl = document.createElement("div");
  monthEl.className = "ogenda-mini-cal-month";

  const header = document.createElement("div");
  header.className = "ogenda-mini-cal-header";
  header.textContent = formatChineseMonth(monthAnchor);
  monthEl.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "ogenda-mini-cal-grid";
  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-mini-cal-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  const weeks = monthGridWeeks(monthAnchor);
  const month = monthAnchor.getMonth();
  const selKey = selected ? toDateKey(startOfDay(selected)) : null;

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-mini-cal-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-mini-cal-othermonth");
      const dayKey = toDateKey(day);
      if (selKey && dayKey === selKey) cell.classList.add("ogenda-mini-cal-selected");
      cell.textContent = String(day.getDate());
      if (eventDays.has(dayKey)) {
        const dot = document.createElement("span");
        dot.className = "ogenda-mini-cal-dot";
        cell.appendChild(dot);
      }
      cell.addEventListener("click", () => onDayClick(day));
      grid.appendChild(cell);
    }
  }
  monthEl.appendChild(grid);
  wrap.appendChild(monthEl);
}

export function renderMiniCalendar(
  container: HTMLElement,
  anchor: Date,
  onDayClick: (day: Date) => void,
  opts: MiniCalOpts = {},
): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ogenda-mini-cal";

  const count = Math.max(1, opts.monthCount ?? 1);
  const eventDays = opts.eventDays ?? new Set<string>();
  for (let i = 0; i < count; i++) {
    const monthAnchor = new Date(anchor.getFullYear(), anchor.getMonth() + i, 1);
    // Only the current month (i === 0) carries the selected-day highlight.
    renderOneMonth(wrap, monthAnchor, i === 0 ? anchor : null, eventDays, onDayClick);
  }
  container.appendChild(wrap);
}
```

- [ ] **Step 4: 接线面板(按高度算月数 + 更宽范围求标点)**

在 `src/agenda-panel/agenda-panel-view.ts`:

① 把 mini-calendar 的 import 改为多导入:

```ts
import { renderMiniCalendar, monthsToFill, daysWithEvents } from "./mini-calendar";
```

② 把 `render()` 里日视图分支替换为:

```ts
        else if (this.tab === "day") {
          const dayWrap = body.createDiv({ cls: "ogenda-day-layout" });
          const dayMain = dayWrap.createDiv({ cls: "ogenda-day-main" });
          const daySide = dayWrap.createDiv({ cls: "ogenda-day-side" });
          renderDayView(dayMain, occurrences, onEventClick, colors);
          const monthCount = monthsToFill(daySide.clientHeight);
          const miniStart = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1);
          const miniEnd = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + monthCount, 1);
          const miniOccs = expandOccurrences(events, miniStart, miniEnd);
          renderMiniCalendar(
            daySide,
            this.anchor,
            (day) => {
              this.anchor = day;
              void this.render();
            },
            { monthCount, eventDays: daysWithEvents(miniOccs) },
          );
        }
```

(`expandOccurrences` 与 `events` 已在 `render()` 作用域内可用。)

- [ ] **Step 5: 跑测试 + 构建 + 全量回归**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/mini-calendar.test.ts`
Expected: PASS(含新用例 + 既有单月用例)。
Run: `npm run build`
Expected: 无报错。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿。

- [ ] **Step 6: 真机目测(手动验收)**

真机重载后,切到"日"视图确认:右栏从当前月起纵向排下若干个月、把右栏基本填满;有事件的日子底部有小圆点;点某月某日跳转锚点;周/月视图事件条有分类色;统计页是卡片仪表盘(KPI + 状态条 + 分类色块 + 底部小指标)。

- [ ] **Step 7: 提交**

```bash
git add src/agenda-panel/mini-calendar.ts tests/agenda-panel/mini-calendar.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): multi-month mini-calendar (#47) — fill sidebar by height + event dots + zh month titles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review(计划二)

- **Spec 覆盖**:周/月色条(§2)→ Task 1;统计仪表盘(§2)→ Task 2;多月迷你日历 #47(§2)→ Task 3。**不含**:表单/bug/设置(→ 计划三)。
- **占位扫描**:无;每个代码步给完整代码。
- **类型一致**:视图 `colors` 均为可选尾参 `ColorResolver`;`renderStatsView(container, stats, colors?)`、`renderMiniCalendar(container, anchor, onDayClick, opts?)` 与面板调用一致;`monthsToFill`/`daysWithEvents` 签名与测试一致。
- **既有测试零回归**:周/月/迷你日历既有用例不改(新增可选参 + 新用例);仅 stats-view 测试整体重写(仪表盘结构与旧数字堆不同)。
- **计算层不变**:`stats.ts` / `computeStats` 未触碰。
