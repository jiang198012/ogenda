# ogenda Agenda 面板 v2 — CRUD + 分组 + 月度统计 + 时区设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 D4-UI v1 的只读 Agenda 面板升级成可以直接新建/编辑/删除事件,同时把清单视图改成按状态分组、加一个月度统计 tab、加一个可选的插件级时区设置。

**Architecture:** 复用 D1-D3 已有的存储/同步层(`MonthlyStore.sync()`/`removeByUid()`/`syncBidirectional()`),不新增任何 CalDAV 代码;新建/编辑用 Obsidian 原生 `Modal` 承载表单,保存后立刻(后台、不阻塞 UI)触发一次已有的双向同步;表单的字段校验/组装逻辑拆成纯函数便于单测,`Modal` 本身作为薄壳不测(沿用项目里 Obsidian 集成边界不写单测的惯例)。

**Tech Stack:** TypeScript(现有),`ical.js`(现有依赖,未新增),Obsidian Plugin API(`Modal`/`ConfirmationModal`/`Setting`/`DropdownComponent`,`ConfirmationModal`/`setDestructive` 需要 `minAppVersion` ≥ 1.13.0,本计划会把 `manifest.json` 从 1.5.0 提到 1.13.0),`Intl.DateTimeFormat`(浏览器/Node 内置,用于时区设置,不引入新依赖),vitest + jsdom。

## Global Constraints
- 同步元数据字段(uid/href/etag/base_hash/origin/source/protocol/server_deleted)不出现在任何用户可见的表单/视图里。
- 新建/编辑/删除**不阻塞 UI**:本地写入(`MonthlyStore.sync()`/`removeByUid()`)成功后立刻关闭弹窗、立刻重渲染;随后台(fire-and-forget)触发 `syncBidirectional()`,失败由其自带的 `notify` 回调弹 `Notice`,不新写错误处理逻辑。
- 新建/编辑复用 `MonthlyStore.sync([event])`(内部 `upsertEvents()` 天然按 uid 有则更新、无则新建);删除复用 `MonthlyStore.removeByUid([uid])`;两者都不新增 CalDAV 读写代码。
- 循环事件(带 `rrule`)这轮不支持编辑其重复规则——编辑表单不暴露 `rrule` 字段,但编辑已有事件时必须原样保留其 `rrule`(不能因为编辑了别的字段就把重复规则冲掉)。
- 清单视图按 `status` 分组(confirmed/tentative/cancelled/未设置),组内按开始时间正序,不再按天二次分组;分组可折叠,折叠状态不跨渲染保留。
- 统计 tab 按自然月计算(不是滚动窗口),复用面板已有的锚点日期状态。
- 时区设置留空 = 沿用系统时区(现状行为不变);用 `Intl.DateTimeFormat` 实现,不引入 `date-fns-tz`/`luxon`/`moment-timezone`。
- UI 渲染延续零框架、原生 DOM API 的风格(`Modal`/`Setting` 除外,那是 Obsidian 集成边界)。

---

### Task 1: 时区设置 — `OgendaSettings` 加 `timezone` 字段

**Files:**
- Modify: `src/settings/settings.ts`
- Test: `tests/settings/settings.test.ts`

**Interfaces:**
- Produces: `OgendaSettings.timezone: string`(空字符串 = 未设置);`DEFAULT_SETTINGS.timezone === ""`。

- [ ] **Step 1: 写失败测试**

在 `tests/settings/settings.test.ts` 现有两个 `it` 基础上新增:

```typescript
  it("keeps a configured timezone and defaults to empty string when absent", () => {
    expect(sanitizeSettings({ timezone: "America/Los_Angeles" }).timezone).toBe("America/Los_Angeles");
    expect(sanitizeSettings({}).timezone).toBe("");
    expect(DEFAULT_SETTINGS.timezone).toBe("");
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/settings/settings.test.ts`(若输出异常简短/不像 vitest 标准格式,改用 `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`)
Expected: FAIL — `sanitizeSettings({ timezone: ... }).timezone` 是 `undefined` 不是字符串

- [ ] **Step 3: 实现**

`src/settings/settings.ts` 现在的样子(完整文件供对照):第 1-12 行是 `OgendaSettings` 接口,第 14-23 行是 `DEFAULT_SETTINGS`,第 25-40 行是 `sanitizeSettings`。三处都要加一行:

```typescript
export interface OgendaSettings {
  email: string;
  /** Gmail app password, stored in plaintext in data.json (user-accepted tradeoff). */
  appPassword: string;
  storageFolder: string;
  scanCount: number;
  syncOnStartup: boolean;
  // --- iCloud CalDAV (D0 spike) ---
  icloudUser: string;
  icloudAppPassword: string;
  icloudCalUrl: string;
  /** IANA timezone name (e.g. "America/Los_Angeles"); empty = use the system timezone. */
  timezone: string;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  email: "",
  appPassword: "",
  storageFolder: "Agenda",
  scanCount: 50,
  syncOnStartup: false,
  icloudUser: "",
  icloudAppPassword: "",
  icloudCalUrl: "",
  timezone: "",
};

export function sanitizeSettings(raw: unknown): OgendaSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    email: str(r.email, DEFAULT_SETTINGS.email),
    appPassword: str(r.appPassword, DEFAULT_SETTINGS.appPassword),
    storageFolder: str(r.storageFolder, DEFAULT_SETTINGS.storageFolder),
    scanCount: num(r.scanCount, DEFAULT_SETTINGS.scanCount),
    syncOnStartup: bool(r.syncOnStartup, DEFAULT_SETTINGS.syncOnStartup),
    icloudUser: str(r.icloudUser, DEFAULT_SETTINGS.icloudUser),
    icloudAppPassword: str(r.icloudAppPassword, DEFAULT_SETTINGS.icloudAppPassword),
    icloudCalUrl: str(r.icloudCalUrl, DEFAULT_SETTINGS.icloudCalUrl),
    timezone: str(r.timezone, DEFAULT_SETTINGS.timezone),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/settings/settings.test.ts`
Expected: PASS(3/3,含之前 2 条)

- [ ] **Step 5: Commit**

```bash
git add src/settings/settings.ts tests/settings/settings.test.ts
git commit -m "feat(v2): add timezone setting field (empty = system timezone)"
```

---

### Task 2: 时区设置 — 设置页 UI

**Files:**
- Modify: `src/settings/settings-tab.ts`

无单测(Obsidian `PluginSettingTab` 集成边界,同项目里其它设置项一样的惯例)。

**Interfaces:**
- Consumes: `OgendaSettings.timezone`(Task 1)

- [ ] **Step 1: 实现**

在 `src/settings/settings-tab.ts` 的 `display()` 方法里,`Sync on startup` 那个 `Setting` 块(现有代码第 52-60 行)之后、`iCloud CalDAV` 那个 `h3` 分隔(现有代码第 63 行)之前插入:

```typescript
    new Setting(containerEl)
      .setName("时区")
      .setDesc("IANA 时区名,如 Asia/Shanghai、America/Los_Angeles。留空 = 用电脑系统时区(默认行为)。")
      .addText((t) =>
        t.setValue(this.plugin.settings.timezone).onChange(async (v) => {
          this.plugin.settings.timezone = v.trim();
          await this.plugin.saveSettings();
        })
      );
```

- [ ] **Step 2: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/settings/settings-tab.ts
git commit -m "feat(v2): expose timezone setting in the plugin settings tab"
```

---

### Task 3: 时区设置 — `todayInTimezone()`

**Files:**
- Create: `src/agenda-panel/timezone.ts`
- Test: `tests/agenda-panel/timezone.test.ts`

**Interfaces:**
- Produces: `export function todayInTimezone(timezone: string | undefined, now: Date = new Date()): Date` —— 返回一个"本地读取分量(getFullYear/getMonth/getDate/getHours/…)等于目标时区当下挂钟时间"的 `Date`;`timezone` 为空/undefined 时原样返回 `now`(等价于现状行为)。后续 Task 14(AgendaPanelView 接入)用它计算"今天"锚点。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/timezone.test.ts
import { describe, it, expect } from "vitest";
import { todayInTimezone } from "../../src/agenda-panel/timezone";

describe("todayInTimezone", () => {
  it("returns `now` unchanged when no timezone is configured", () => {
    const now = new Date("2026-07-18T20:30:00Z");
    const out = todayInTimezone(undefined, now);
    expect(out.getTime()).toBe(now.getTime());
  });

  it("returns the wall-clock date/time in the configured zone, readable via local getters", () => {
    // 2026-07-18T20:30:00Z in America/Los_Angeles (PDT, UTC-7 in July) is 2026-07-18 13:30:00 local wall-clock.
    const now = new Date("2026-07-18T20:30:00Z");
    const out = todayInTimezone("America/Los_Angeles", now);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6); // July, 0-indexed
    expect(out.getDate()).toBe(18);
    expect(out.getHours()).toBe(13);
    expect(out.getMinutes()).toBe(30);
  });

  it("crosses a date boundary correctly when UTC and the target zone disagree on the day", () => {
    // 2026-07-19T04:00:00Z is already the 19th in UTC, but still 2026-07-18 21:00 in PDT (UTC-7).
    const now = new Date("2026-07-19T04:00:00Z");
    const out = todayInTimezone("America/Los_Angeles", now);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(6);
    expect(out.getDate()).toBe(18);
    expect(out.getHours()).toBe(21);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/timezone.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/timezone'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/timezone.ts
export function todayInTimezone(timezone: string | undefined, now: Date = new Date()): Date {
  if (!timezone) return now;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/timezone.test.ts`
Expected: PASS(3/3)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/timezone.ts tests/agenda-panel/timezone.test.ts
git commit -m "feat(v2): todayInTimezone — compute wall-clock 'today' in a configured IANA zone"
```

---

### Task 4: 月度统计 — 导出 `fieldsToEvent`

**Files:**
- Modify: `src/sync/plan.ts`

无新增单测(纯签名可见性改动,不改行为;现有 `tests/sync/plan.test.ts` 只通过 `planSync` 间接用到它,不受影响)。

**Interfaces:**
- Produces: `export function fieldsToEvent(fields: Record<string, string>): AgendaEvent`(原来是模块内私有函数)—— Task 5 会 import 它。

- [ ] **Step 1: 实现**

`src/sync/plan.ts` 里把:

```typescript
function fieldsToEvent(fields: Record<string, string>): AgendaEvent {
```

改成:

```typescript
export function fieldsToEvent(fields: Record<string, string>): AgendaEvent {
```

(只改这一行,函数体不变。)

- [ ] **Step 2: 跑一次全量测试确认没有连带破坏**

Run: `npx vitest run`(若输出异常简短,改用 `node node_modules/vitest/vitest.mjs run`)
Expected: 之前全部测试原样通过(`fieldsToEvent` 的行为完全没变,只是可见性变了)

- [ ] **Step 3: Commit**

```bash
git add src/sync/plan.ts
git commit -m "refactor(v2): export fieldsToEvent from plan.ts for reuse by stats.ts"
```

---

### Task 5: 月度统计 — `computeStats()`

**Files:**
- Create: `src/agenda-panel/stats.ts`
- Test: `tests/agenda-panel/stats.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent`(`../core/event`);`LocalEvent`、`monthOf`(`../store/monthly-store`,已导出);`fieldsToEvent`(`../sync/plan`,Task 4 导出);`hashEvent`(`../core/event`,已导出)。
- Produces:
  ```typescript
  export interface AgendaStats {
    total: number;
    byStatus: Record<string, number>;
    allDayCount: number;
    timedCount: number;
    recurringCount: number;
    onceCount: number;
    byCategory: Record<string, number>;
    busiestDays: { date: string; count: number }[];
    unsyncedCount: number;
  }
  export function computeStats(events: AgendaEvent[], local: LocalEvent[], monthAnchor: Date): AgendaStats
  ```
  Task 6(stats-view.ts)消费这个返回类型。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/stats.test.ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { LocalEvent } from "../../src/store/monthly-store";
import { computeStats } from "../../src/agenda-panel/stats";

const ev = (o: Partial<AgendaEvent> = {}): AgendaEvent => ({
  uid: "x", title: "t", start: "2026-07-10T09:00:00", origin: "synced", ...o,
});

describe("computeStats", () => {
  it("counts only events whose start falls in the anchor's calendar month", () => {
    const events = [ev({ uid: "a", start: "2026-07-10T09:00:00" }), ev({ uid: "b", start: "2026-08-01T09:00:00" })];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.total).toBe(1);
  });

  it("buckets by status, defaulting missing status to '未设置'", () => {
    const events = [
      ev({ uid: "a", status: "confirmed" }),
      ev({ uid: "b", status: "confirmed" }),
      ev({ uid: "c", status: "tentative" }),
      ev({ uid: "d" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.byStatus).toEqual({ confirmed: 2, tentative: 1, "未设置": 1 });
  });

  it("counts all-day vs timed, and recurring vs one-off", () => {
    const events = [
      ev({ uid: "a", allDay: true, start: "2026-07-05" }),
      ev({ uid: "b", allDay: false }),
      ev({ uid: "c", rrule: "FREQ=WEEKLY" }),
      ev({ uid: "d" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.allDayCount).toBe(1);
    expect(stats.timedCount).toBe(3);
    expect(stats.recurringCount).toBe(1);
    expect(stats.onceCount).toBe(3);
  });

  it("buckets by category, defaulting missing category to '未分类'", () => {
    const events = [ev({ uid: "a", category: "工作" }), ev({ uid: "b", category: "工作" }), ev({ uid: "c" })];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.byCategory).toEqual({ "工作": 2, "未分类": 1 });
  });

  it("ranks the top 3 busiest days descending by event count", () => {
    const events = [
      ev({ uid: "a", start: "2026-07-06T09:00:00" }),
      ev({ uid: "b", start: "2026-07-06T14:00:00" }),
      ev({ uid: "c", start: "2026-07-06T18:00:00" }),
      ev({ uid: "d", start: "2026-07-10T09:00:00" }),
      ev({ uid: "e", start: "2026-07-10T14:00:00" }),
      ev({ uid: "f", start: "2026-07-20T09:00:00" }),
      ev({ uid: "g", start: "2026-07-21T09:00:00" }),
    ];
    const stats = computeStats(events, [], new Date(2026, 6, 15));
    expect(stats.busiestDays).toEqual([
      { date: "2026-07-06", count: 3 },
      { date: "2026-07-10", count: 2 },
      { date: "2026-07-20", count: 1 },
    ]);
  });

  it("counts local events with no href, or a hash mismatch vs base_hash, as unsynced -- scoped to the anchor month", () => {
    const local: LocalEvent[] = [
      { uid: "a", hasHref: false, prose: "", fields: { uid: "a", title: "新建的", start: "2026-07-08T09:00:00" } },
      {
        uid: "b", hasHref: true, prose: "",
        fields: { uid: "b", title: "改过的", start: "2026-07-09T09:00:00", href: "https://x/b.ics", base_hash: "stale" },
      },
      {
        uid: "c", hasHref: true, prose: "",
        fields: { uid: "c", title: "没改过", start: "2026-07-11T09:00:00", href: "https://x/c.ics", base_hash: "" },
      },
      { uid: "d", hasHref: false, prose: "", fields: { uid: "d", title: "别的月", start: "2026-08-01T09:00:00" } },
    ];
    // "没改过" gets a real base_hash equal to its own current hash, so it does NOT count as unsynced.
    const stats1 = computeStats([], local, new Date(2026, 6, 15));
    expect(stats1.unsyncedCount).toBe(2); // a (no href) + b (hash mismatch); d is filtered out (wrong month)
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/stats.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/stats'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/stats.ts
import { AgendaEvent, hashEvent } from "../core/event";
import { LocalEvent, monthOf } from "../store/monthly-store";
import { fieldsToEvent } from "../sync/plan";

export interface AgendaStats {
  total: number;
  byStatus: Record<string, number>;
  allDayCount: number;
  timedCount: number;
  recurringCount: number;
  onceCount: number;
  byCategory: Record<string, number>;
  busiestDays: { date: string; count: number }[];
  unsyncedCount: number;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function computeStats(events: AgendaEvent[], local: LocalEvent[], monthAnchor: Date): AgendaStats {
  const targetMonth = monthKey(monthAnchor);
  const monthEvents = events.filter((e) => monthOf(e.start) === targetMonth);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let allDayCount = 0;
  let timedCount = 0;
  let recurringCount = 0;
  let onceCount = 0;
  const dayCounts = new Map<string, number>();

  for (const ev of monthEvents) {
    const statusKey = ev.status ?? "未设置";
    byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;
    const catKey = ev.category ?? "未分类";
    byCategory[catKey] = (byCategory[catKey] ?? 0) + 1;
    if (ev.allDay) allDayCount++;
    else timedCount++;
    if (ev.rrule) recurringCount++;
    else onceCount++;
    const dayKey = ev.start.slice(0, 10);
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
  }

  const busiestDays = [...dayCounts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count || (a.date < b.date ? -1 : 1))
    .slice(0, 3);

  const monthLocal = local.filter((l) => monthOf(l.fields["start"] ?? "") === targetMonth);
  const unsyncedCount = monthLocal.filter((l) => {
    if (!l.hasHref) return true;
    return hashEvent(fieldsToEvent(l.fields)) !== (l.fields["base_hash"] ?? "");
  }).length;

  return {
    total: monthEvents.length,
    byStatus,
    allDayCount,
    timedCount,
    recurringCount,
    onceCount,
    byCategory,
    busiestDays,
    unsyncedCount,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/stats.test.ts`
Expected: PASS(6/6)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/stats.ts tests/agenda-panel/stats.test.ts
git commit -m "feat(v2): computeStats — monthly event metrics for the stats tab"
```

---

### Task 6: 月度统计 — `renderStatsView()`

**Files:**
- Create: `src/agenda-panel/views/stats-view.ts`
- Test: `tests/agenda-panel/views/stats-view.test.ts`

**Interfaces:**
- Consumes: `AgendaStats`(Task 5,`../stats`)
- Produces: `export function renderStatsView(container: HTMLElement, stats: AgendaStats): void`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/views/stats-view.test.ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/stats-view.test.ts`
Expected: FAIL — `Cannot find module '../../../src/agenda-panel/views/stats-view'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/views/stats-view.ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/stats-view.test.ts`
Expected: PASS(3/3)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/views/stats-view.ts tests/agenda-panel/views/stats-view.test.ts
git commit -m "feat(v2): stats view renderer"
```

---

### Task 7: 清单视图改为按状态分组

**Files:**
- Modify: `src/agenda-panel/views/list-view.ts`
- Modify: `src/agenda-panel/date-grid.ts`(删掉不再被生产代码使用的 `groupByDay`)
- Test: `tests/agenda-panel/views/list-view.test.ts`(整体替换——旧的按天分组行为被本任务取代,不是新增)
- Test: `tests/agenda-panel/date-grid.test.ts`(删掉 `groupByDay` 相关的那条测试,其余不动)

**Interfaces:**
- Produces: `export function renderListView(container: HTMLElement, occurrences: EventOccurrence[], onEventClick: (event: AgendaEvent) => void): void` —— **注意签名变了**:去掉了原来的第三个参数 `today: Date`(按状态分组后不再需要判断"今天",这个参数已经没有消费者)。Task 14(AgendaPanelView)调这个新签名(3 个参数,不传 today)。

- [ ] **Step 1: 写失败测试(整体替换旧文件)**

```typescript
// tests/agenda-panel/views/list-view.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderListView } from "../../../src/agenda-panel/views/list-view";

const mkOcc = (uid: string, start: string, title: string, status?: string, location?: string): EventOccurrence => ({
  event: { uid, title, start, status, location, origin: "synced" },
  start,
});

describe("renderListView", () => {
  it("groups occurrences by status, in confirmed/tentative/cancelled/未设置 order", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-20T10:00:00", "无状态事件"),
      mkOcc("b", "2026-07-18T14:00:00", "已确认事件", "confirmed"),
      mkOcc("c", "2026-07-19T09:00:00", "待定事件", "tentative"),
    ];
    renderListView(container, occs, () => {});

    const headers = container.querySelectorAll(".ogenda-list-statusheader");
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain("confirmed");
    expect(headers[1].textContent).toContain("tentative");
    expect(headers[2].textContent).toContain("未设置");
  });

  it("sorts events within a status group by start time ascending", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-20T10:00:00", "晚一点", "confirmed"),
      mkOcc("b", "2026-07-18T14:00:00", "早一点", "confirmed"),
    ];
    renderListView(container, occs, () => {});
    const titles = [...container.querySelectorAll(".ogenda-event-title")].map((el) => el.textContent);
    expect(titles).toEqual(["早一点", "晚一点"]);
  });

  it("shows a count next to each status group header", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed"), mkOcc("b", "2026-07-19T09:00:00", "y", "confirmed")];
    renderListView(container, occs, () => {});
    expect(container.querySelector(".ogenda-list-statusheader")!.textContent).toContain("2");
  });

  it("collapses a group's items when its header is clicked", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed")];
    renderListView(container, occs, () => {});
    const header = container.querySelector(".ogenda-list-statusheader") as HTMLElement;
    const items = container.querySelector(".ogenda-list-statusitems") as HTMLElement;
    expect(items.classList.contains("collapsed")).toBe(false);
    header.click();
    expect(items.classList.contains("collapsed")).toBe(true);
  });

  it("calls onEventClick with the underlying AgendaEvent when a row is clicked", () => {
    const container = document.createElement("div");
    const occ = mkOcc("a", "2026-07-18T14:00:00", "周会同步", "confirmed");
    const onClick = vi.fn();
    renderListView(container, [occ], onClick);
    (container.querySelector(".ogenda-event-row") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });

  it("renders location when present", () => {
    const container = document.createElement("div");
    renderListView(container, [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed", "线上")], () => {});
    expect(container.textContent).toContain("线上");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts`
Expected: FAIL — `.ogenda-list-statusheader` 相关断言全部落空(现有实现按天分组,没有这个 class)

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/views/list-view.ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";

const STATUS_ORDER = ["confirmed", "tentative", "cancelled"];

interface StatusGroup {
  label: string;
  items: EventOccurrence[];
}

function groupByStatus(occurrences: EventOccurrence[]): StatusGroup[] {
  const buckets = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const key = occ.event.status?.trim() || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(occ);
  }
  for (const items of buckets.values()) {
    items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }
  const knownKeys = STATUS_ORDER.filter((s) => buckets.has(s));
  const otherKeys = [...buckets.keys()].filter((k) => k !== "" && !STATUS_ORDER.includes(k)).sort();
  const orderedKeys = [...knownKeys, ...otherKeys];
  if (buckets.has("")) orderedKeys.push("");
  return orderedKeys.map((key) => ({ label: key || "未设置", items: buckets.get(key)! }));
}

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
  const s = hhmm(occ.start);
  const e = hhmm(occ.end);
  return e ? `${s}–${e}` : s;
}

export function renderListView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  for (const group of groupByStatus(occurrences)) {
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-statusgroup";

    const header = document.createElement("div");
    header.className = "ogenda-list-statusheader";
    header.textContent = `${group.label} (${group.items.length})`;

    const itemsEl = document.createElement("div");
    itemsEl.className = "ogenda-list-statusitems";

    header.addEventListener("click", () => {
      itemsEl.classList.toggle("collapsed");
    });
    groupEl.appendChild(header);

    for (const occ of group.items) {
      const row = document.createElement("div");
      row.className = "ogenda-event-row";
      row.addEventListener("click", () => onEventClick(occ.event));

      const time = document.createElement("span");
      time.className = "ogenda-event-time";
      time.textContent = formatTime(occ);
      row.appendChild(time);

      const title = document.createElement("span");
      title.className = "ogenda-event-title";
      title.textContent = occ.event.title;
      row.appendChild(title);

      if (occ.event.location) {
        const loc = document.createElement("span");
        loc.className = "ogenda-event-loc";
        loc.textContent = occ.event.location;
        row.appendChild(loc);
      }

      itemsEl.appendChild(row);
    }
    groupEl.appendChild(itemsEl);
    container.appendChild(groupEl);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts`
Expected: PASS(6/6)

- [ ] **Step 5: 清理 `date-grid.ts` 里现在没有生产代码消费者的 `groupByDay`**

`src/agenda-panel/date-grid.ts` 删掉这个函数(第 43-52 行):

```typescript
export function groupByDay(occurrences: EventOccurrence[]): { date: Date; items: EventOccurrence[] }[] {
  const map = new Map<string, { date: Date; items: EventOccurrence[] }>();
  for (const occ of occurrences) {
    const day = startOfDay(new Date(occ.start));
    const key = toDateKey(day);
    if (!map.has(key)) map.set(key, { date: day, items: [] });
    map.get(key)!.items.push(occ);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
```

同时把文件顶部 `import { EventOccurrence } from "./occurrences";` 这行也删掉(`EventOccurrence` 只有 `groupByDay` 用到)。

在 `tests/agenda-panel/date-grid.test.ts` 里删掉 `groupByDay groups occurrences by calendar day and sorts groups ascending` 这条测试(及其顶部对应的 `EventOccurrence`/`AgendaEvent` import,如果删完这条测试后这些 import 变成未使用,一并删掉),其余 6 条测试(`toDateKey`/`startOfDay`/`addDays`/`startOfWeek` 两条/`monthGridWeeks`)不动。

- [ ] **Step 6: 运行测试确认通过(含全量回归)**

Run: `npx vitest run`(若输出异常简短,改用 `node node_modules/vitest/vitest.mjs run`)
Expected: 全绿,`date-grid.test.ts` 从 7 条变成 6 条,`list-view.test.ts` 6 条,其余不变

- [ ] **Step 7: Commit**

```bash
git add src/agenda-panel/views/list-view.ts src/agenda-panel/date-grid.ts tests/agenda-panel/views/list-view.test.ts tests/agenda-panel/date-grid.test.ts
git commit -m "feat(v2): list view groups by status instead of by day (collapsible groups)"
```

---

### Task 8: CRUD — `generateUid()`

**Files:**
- Create: `src/agenda-panel/uid.ts`
- Test: `tests/agenda-panel/uid.test.ts`

**Interfaces:**
- Produces: `export function generateUid(): string`(格式 `<uuid>@ogenda`)。Task 9 的 `buildEventFromFields` 会把它作为依赖注入参数使用。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/uid.test.ts
import { describe, it, expect } from "vitest";
import { generateUid } from "../../src/agenda-panel/uid";

describe("generateUid", () => {
  it("produces a uuid-shaped uid suffixed with @ogenda", () => {
    const uid = generateUid();
    expect(uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@ogenda$/);
  });

  it("produces a different uid on each call", () => {
    expect(generateUid()).not.toBe(generateUid());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/uid.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/uid'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/uid.ts
export function generateUid(): string {
  return `${crypto.randomUUID()}@ogenda`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/uid.test.ts`
Expected: PASS(2/2)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/uid.ts tests/agenda-panel/uid.test.ts
git commit -m "feat(v2): generateUid — uuid-based uid for locally-created events"
```

---

### Task 9: CRUD — 表单校验 + 字段组装(纯函数)

**Files:**
- Create: `src/agenda-panel/event-form-fields.ts`
- Test: `tests/agenda-panel/event-form-fields.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent`(`../core/event`)
- Produces:
  ```typescript
  export interface RawFormFields {
    title: string; start: string; end: string; allDay: boolean;
    location: string; organizer: string; attendees: string;
    status: string; rsvp: string; categoryDropdown: string; categoryText: string; tags: string;
  }
  export interface ValidationResult { valid: boolean; errors: string[] }
  export function validateEventForm(fields: Pick<RawFormFields, "title" | "start">): ValidationResult
  export function buildEventFromFields(fields: RawFormFields, existing: AgendaEvent | null, generateUid: () => string): AgendaEvent
  ```
  Task 13(`event-form-modal.ts`)是这两个函数唯一的调用方,把表单的 DOM 输入收集成 `RawFormFields` 后交给它们处理,`Modal` 本身不做字段拼装逻辑。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/event-form-fields.test.ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { validateEventForm, buildEventFromFields, RawFormFields } from "../../src/agenda-panel/event-form-fields";

const blankFields = (): RawFormFields => ({
  title: "", start: "", end: "", allDay: false,
  location: "", organizer: "", attendees: "",
  status: "", rsvp: "", categoryDropdown: "", categoryText: "", tags: "",
});

describe("validateEventForm", () => {
  it("requires a non-empty title and start", () => {
    expect(validateEventForm({ title: "", start: "" }).valid).toBe(false);
    expect(validateEventForm({ title: "会议", start: "" }).valid).toBe(false);
    expect(validateEventForm({ title: "", start: "2026-07-20" }).valid).toBe(false);
    expect(validateEventForm({ title: "会议", start: "2026-07-20" }).valid).toBe(true);
  });

  it("rejects whitespace-only title/start", () => {
    expect(validateEventForm({ title: "   ", start: "2026-07-20" }).valid).toBe(false);
  });
});

describe("buildEventFromFields", () => {
  it("generates a new uid when creating (existing = null)", () => {
    const fields = { ...blankFields(), title: "新事件", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, null, () => "generated-uid@ogenda");
    expect(ev.uid).toBe("generated-uid@ogenda");
    expect(ev.origin).toBe("local");
  });

  it("preserves the existing uid/origin/href/etag/baseHash/rrule when editing", () => {
    const existing: AgendaEvent = {
      uid: "keep-me@ogenda", title: "old", start: "2026-07-01T09:00:00", origin: "synced",
      href: "https://x/a.ics", etag: '"e1"', baseHash: "abc123", rrule: "FREQ=WEEKLY",
    };
    const fields = { ...blankFields(), title: "改过的标题", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, existing, () => "should-not-be-used");
    expect(ev.uid).toBe("keep-me@ogenda");
    expect(ev.origin).toBe("synced");
    expect(ev.href).toBe("https://x/a.ics");
    expect(ev.etag).toBe('"e1"');
    expect(ev.baseHash).toBe("abc123");
    expect(ev.rrule).toBe("FREQ=WEEKLY");
    expect(ev.title).toBe("改过的标题");
  });

  it("splits attendees and tags on comma, trimming whitespace, undefined when empty", () => {
    const fields = { ...blankFields(), title: "t", start: "2026-07-20T10:00:00", attendees: "a@x, b@x ,c@x", tags: " x, y " };
    const ev = buildEventFromFields(fields, null, () => "u@ogenda");
    expect(ev.attendees).toEqual(["a@x", "b@x", "c@x"]);
    expect(ev.tags).toEqual(["x", "y"]);
    const empty = buildEventFromFields({ ...blankFields(), title: "t", start: "2026-07-20T10:00:00" }, null, () => "u@ogenda");
    expect(empty.attendees).toBeUndefined();
    expect(empty.tags).toBeUndefined();
  });

  it("prefers categoryText over categoryDropdown when both are set", () => {
    const fields = { ...blankFields(), title: "t", start: "2026-07-20T10:00:00", categoryDropdown: "工作", categoryText: "新分类" };
    const ev = buildEventFromFields(fields, null, () => "u@ogenda");
    expect(ev.category).toBe("新分类");
  });

  it("falls back to categoryDropdown when categoryText is blank, and to undefined when both are blank", () => {
    const withDropdown = buildEventFromFields(
      { ...blankFields(), title: "t", start: "2026-07-20T10:00:00", categoryDropdown: "工作" }, null, () => "u@ogenda",
    );
    expect(withDropdown.category).toBe("工作");
    const withNeither = buildEventFromFields({ ...blankFields(), title: "t", start: "2026-07-20T10:00:00" }, null, () => "u@ogenda");
    expect(withNeither.category).toBeUndefined();
  });

  it("converts blank optional text fields to undefined, not empty string", () => {
    const fields = { ...blankFields(), title: "t", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, null, () => "u@ogenda");
    expect(ev.end).toBeUndefined();
    expect(ev.location).toBeUndefined();
    expect(ev.organizer).toBeUndefined();
    expect(ev.rsvp).toBeUndefined();
    expect(ev.status).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/event-form-fields'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/event-form-fields.ts
import { AgendaEvent } from "../core/event";

export interface RawFormFields {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string;
  status: string;
  rsvp: string;
  categoryDropdown: string;
  categoryText: string;
  tags: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEventForm(fields: Pick<RawFormFields, "title" | "start">): ValidationResult {
  const errors: string[] = [];
  if (!fields.title.trim()) errors.push("标题不能为空");
  if (!fields.start.trim()) errors.push("开始时间不能为空");
  return { valid: errors.length === 0, errors };
}

function splitList(s: string): string[] | undefined {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function buildEventFromFields(
  fields: RawFormFields,
  existing: AgendaEvent | null,
  generateUid: () => string,
): AgendaEvent {
  const category = fields.categoryText.trim() || fields.categoryDropdown || undefined;
  return {
    uid: existing?.uid ?? generateUid(),
    title: fields.title.trim(),
    start: fields.start.trim(),
    end: fields.end.trim() || undefined,
    allDay: fields.allDay,
    location: fields.location.trim() || undefined,
    organizer: fields.organizer.trim() || undefined,
    attendees: splitList(fields.attendees),
    status: fields.status || undefined,
    rsvp: fields.rsvp.trim() || undefined,
    category,
    tags: splitList(fields.tags),
    origin: existing?.origin ?? "local",
    href: existing?.href,
    etag: existing?.etag,
    baseHash: existing?.baseHash,
    rrule: existing?.rrule,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts`
Expected: PASS(9/9)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/event-form-fields.ts tests/agenda-panel/event-form-fields.test.ts
git commit -m "feat(v2): pure validation + field-assembly logic for the create/edit form"
```

---

### Task 10: CRUD — 迷你日历组件

**Files:**
- Create: `src/agenda-panel/mini-calendar.ts`
- Test: `tests/agenda-panel/mini-calendar.test.ts`

**Interfaces:**
- Consumes: `monthGridWeeks`、`startOfDay`(`./date-grid`,已有,不变)
- Produces: `export function renderMiniCalendar(container: HTMLElement, anchor: Date, onDayClick: (day: Date) => void): void`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/mini-calendar.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderMiniCalendar } from "../../src/agenda-panel/mini-calendar";

describe("renderMiniCalendar", () => {
  it("renders a 7x5 grid for July 2026", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {});
    expect(container.querySelectorAll(".ogenda-mini-cal-cell").length).toBe(35);
  });

  it("marks padding days from adjacent months", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-mini-cal-cell");
    expect(cells[0].classList.contains("ogenda-mini-cal-othermonth")).toBe(true); // June 29
    expect(cells[2].classList.contains("ogenda-mini-cal-othermonth")).toBe(false); // July 1
  });

  it("marks the anchor date as selected", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 18), () => {});
    const cells = [...container.querySelectorAll(".ogenda-mini-cal-cell")];
    const selected = cells.find((c) => c.classList.contains("ogenda-mini-cal-selected"));
    expect(selected?.textContent).toBe("18");
  });

  it("calls onDayClick with the clicked date", () => {
    const container = document.createElement("div");
    const onClick = vi.fn();
    renderMiniCalendar(container, new Date(2026, 6, 15), onClick);
    const cells = [...container.querySelectorAll(".ogenda-mini-cal-cell")];
    const day1 = cells.find((c) => c.textContent === "1" && !c.classList.contains("ogenda-mini-cal-othermonth"));
    (day1 as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(new Date(2026, 6, 1));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/mini-calendar.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/mini-calendar'`

- [ ] **Step 3: 实现**

```typescript
// src/agenda-panel/mini-calendar.ts
import { monthGridWeeks, startOfDay } from "./date-grid";

export function renderMiniCalendar(container: HTMLElement, anchor: Date, onDayClick: (day: Date) => void): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ogenda-mini-cal";

  const header = document.createElement("div");
  header.className = "ogenda-mini-cal-header";
  header.textContent = `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
  wrap.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "ogenda-mini-cal-grid";

  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-mini-cal-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();
  const anchorDay = startOfDay(anchor);

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-mini-cal-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-mini-cal-othermonth");
      if (day.getTime() === anchorDay.getTime()) cell.classList.add("ogenda-mini-cal-selected");
      cell.textContent = String(day.getDate());
      cell.addEventListener("click", () => onDayClick(day));
      grid.appendChild(cell);
    }
  }
  wrap.appendChild(grid);
  container.appendChild(wrap);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/mini-calendar.test.ts`
Expected: PASS(4/4)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/mini-calendar.ts tests/agenda-panel/mini-calendar.test.ts
git commit -m "feat(v2): mini month-calendar widget for quick date jump"
```

---

### Task 11: CRUD — 周/月视图支持"点空白格子新建"

**Files:**
- Modify: `src/agenda-panel/views/week-view.ts`
- Modify: `src/agenda-panel/views/month-view.ts`
- Test: `tests/agenda-panel/views/week-view.test.ts`(新增用例,既有 5 条不动)
- Test: `tests/agenda-panel/views/month-view.test.ts`(新增用例,既有 6 条不动)

**Interfaces:**
- Produces:`renderWeekView`/`renderMonthView` 都新增一个**可选**第 5 参 `onEmptyClick?: (day: Date) => void`,不传时行为跟现在完全一样(现有调用方/测试不用改)。Task 14 会传这个参数。

- [ ] **Step 1: 写失败测试(week)**

在 `tests/agenda-panel/views/week-view.test.ts` 现有 5 条基础上新增:

```typescript
  it("calls onEmptyClick with the day when the empty area of a column is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}, onEmpty);
    const cols = container.querySelectorAll(".ogenda-week-col");
    (cols[0] as HTMLElement).click();
    expect(onEmpty).toHaveBeenCalledWith(new Date(2026, 6, 13)); // Monday of that week
  });

  it("does NOT call onEmptyClick when a card inside the column is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    const onEventClick = vi.fn();
    renderWeekView(container, [mkOcc("2026-07-13T14:00:00", "周一的会")], new Date(2026, 6, 15), onEventClick, onEmpty);
    (container.querySelector(".ogenda-week-card") as HTMLElement).click();
    expect(onEventClick).toHaveBeenCalled();
    expect(onEmpty).not.toHaveBeenCalled();
  });
```

(`mkOcc` 沿用文件里已有的那个 helper,不用重新定义。)

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts`
Expected: FAIL — `renderWeekView` 只接受 4 个参数(TS 编译错误)或 `onEmpty` 从未被调用

- [ ] **Step 3: 实现(week-view.ts)**

在 `renderWeekView` 的签名和列渲染循环里加 `onEmptyClick`:

```typescript
export function renderWeekView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
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

(其余代码——imports、`formatTime`——保持不变;上面这段用的是当前已经修过 all-day 时区 bug 的版本,`startOfDay(parseLocalDate(occ.start))`,不要退回成 `new Date(occ.start)`。)

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts`
Expected: PASS(7/7)

- [ ] **Step 5: 写失败测试(month)**

在 `tests/agenda-panel/views/month-view.test.ts` 现有 6 条基础上新增:

```typescript
  it("calls onEmptyClick with the day when the empty area of a cell is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    renderMonthView(container, [], new Date(2026, 6, 15), () => {}, onEmpty);
    const cells = container.querySelectorAll(".ogenda-month-cell");
    (cells[2] as HTMLElement).click(); // July 1 (index 2, per the existing test's own indexing note)
    expect(onEmpty).toHaveBeenCalledWith(new Date(2026, 6, 1));
  });

  it("does NOT call onEmptyClick when a mini-title inside the cell is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    const onEventClick = vi.fn();
    renderMonthView(container, [mkOcc("2026-07-06T09:00:00", "早会")], new Date(2026, 6, 15), onEventClick, onEmpty);
    (container.querySelector(".ogenda-month-mini") as HTMLElement).click();
    expect(onEventClick).toHaveBeenCalled();
    expect(onEmpty).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/month-view.test.ts`
Expected: FAIL — 同上,签名/行为不匹配

- [ ] **Step 7: 实现(month-view.ts)**

```typescript
export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
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

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/month-view.test.ts`
Expected: PASS(8/8)

- [ ] **Step 9: Commit**

```bash
git add src/agenda-panel/views/week-view.ts src/agenda-panel/views/month-view.ts tests/agenda-panel/views/week-view.test.ts tests/agenda-panel/views/month-view.test.ts
git commit -m "feat(v2): week/month views support click-empty-cell-to-create"
```

---

### Task 12: 提升 `minAppVersion` 到 1.13.0(为了用 `ConfirmationModal`/`setDestructive`)

**Files:**
- Modify: `manifest.json`

无单测(纯配置文件)。

- [ ] **Step 1: 实现**

`manifest.json` 里把:

```json
  "minAppVersion": "1.5.0",
```

改成:

```json
  "minAppVersion": "1.13.0",
```

- [ ] **Step 2: 验证**

Run: `cat manifest.json`
Expected: `minAppVersion` 字段值为 `"1.13.0"`(Obsidian 内置的 `ConfirmationModal`/`ButtonComponent.setDestructive()` 是 1.13.0 才有的 API,Task 13/14 会用到)

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore(v2): bump minAppVersion to 1.13.0 for ConfirmationModal/setDestructive"
```

---

### Task 13: CRUD — 新建/编辑表单 `EventFormModal`

**Files:**
- Create: `src/agenda-panel/event-form-modal.ts`

无单测(Obsidian `Modal` 集成边界,同项目里 `navigate.ts`/`agenda-panel-view.ts` 一样的惯例——真正有判断逻辑的部分已经在 Task 9 的纯函数里测过了,这个文件只是把 DOM 输入收集起来交给那两个函数)。

**Interfaces:**
- Consumes: `generateUid`(Task 8,`./uid`);`validateEventForm`/`buildEventFromFields`/`RawFormFields`(Task 9,`./event-form-fields`);`AgendaEvent`(`../core/event`)
- Produces:
  ```typescript
  export class EventFormModal extends Modal {
    constructor(
      app: App,
      existing: AgendaEvent | null,
      prefillStart: string | undefined,
      existingCategories: string[],
      onSubmit: (event: AgendaEvent) => void,
      onViewInNote: (() => void) | undefined,
      onDelete: (() => void) | undefined,
    )
  }
  ```
  Task 14(`AgendaPanelView`)是唯一的调用方。

- [ ] **Step 1: 实现**

```typescript
// src/agenda-panel/event-form-modal.ts
import { App, Modal, Setting } from "obsidian";
import { AgendaEvent } from "../core/event";
import { generateUid } from "./uid";
import { validateEventForm, buildEventFromFields, RawFormFields } from "./event-form-fields";

export class EventFormModal extends Modal {
  private fields: RawFormFields;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private existing: AgendaEvent | null,
    prefillStart: string | undefined,
    private existingCategories: string[],
    private onSubmit: (event: AgendaEvent) => void,
    private onViewInNote: (() => void) | undefined,
    private onDelete: (() => void) | undefined,
  ) {
    super(app);
    const isKnownCategory = existing?.category !== undefined && existingCategories.includes(existing.category);
    this.fields = {
      title: existing?.title ?? "",
      start: existing?.start ?? prefillStart ?? "",
      end: existing?.end ?? "",
      allDay: existing?.allDay ?? Boolean(prefillStart && !existing),
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      categoryDropdown: isKnownCategory ? existing!.category! : "",
      categoryText: existing?.category && !isKnownCategory ? existing.category : "",
      tags: existing?.tags?.join(", ") ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(this.existing ? "编辑事件" : "新建事件");
    const { contentEl } = this;

    new Setting(contentEl).setName("标题").addText((t) =>
      t.setValue(this.fields.title).onChange((v) => (this.fields.title = v)),
    );
    new Setting(contentEl).setName("全天").addToggle((tg) =>
      tg.setValue(this.fields.allDay).onChange((v) => (this.fields.allDay = v)),
    );
    new Setting(contentEl)
      .setName("开始时间")
      .setDesc("全天填 YYYY-MM-DD,非全天填 YYYY-MM-DDTHH:mm:ss")
      .addText((t) => t.setValue(this.fields.start).onChange((v) => (this.fields.start = v)));
    new Setting(contentEl)
      .setName("结束时间")
      .setDesc("可留空")
      .addText((t) => t.setValue(this.fields.end).onChange((v) => (this.fields.end = v)));
    new Setting(contentEl).setName("地点").addText((t) =>
      t.setValue(this.fields.location).onChange((v) => (this.fields.location = v)),
    );
    new Setting(contentEl).setName("组织者").addText((t) =>
      t.setValue(this.fields.organizer).onChange((v) => (this.fields.organizer = v)),
    );
    new Setting(contentEl)
      .setName("参与人")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.attendees).onChange((v) => (this.fields.attendees = v)));
    new Setting(contentEl).setName("状态").addDropdown((d) =>
      d
        .addOption("", "(未设置)")
        .addOption("confirmed", "confirmed")
        .addOption("tentative", "tentative")
        .addOption("cancelled", "cancelled")
        .setValue(this.fields.status)
        .onChange((v) => (this.fields.status = v)),
    );
    new Setting(contentEl).setName("RSVP").addText((t) =>
      t.setValue(this.fields.rsvp).onChange((v) => (this.fields.rsvp = v)),
    );
    new Setting(contentEl)
      .setName("分类")
      .setDesc("下拉选已有分类")
      .addDropdown((d) => {
        d.addOption("", "(未设置)");
        for (const c of this.existingCategories) d.addOption(c, c);
        d.setValue(this.fields.categoryDropdown);
        d.onChange((v) => (this.fields.categoryDropdown = v));
      });
    new Setting(contentEl)
      .setName("新分类")
      .setDesc("可选,填了就优先用这个而不是上面的下拉选择")
      .addText((t) => t.setValue(this.fields.categoryText).onChange((v) => (this.fields.categoryText = v)));
    new Setting(contentEl)
      .setName("标签")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.tags).onChange((v) => (this.fields.tags = v)));

    this.errorEl = contentEl.createDiv({ cls: "ogenda-form-error" });

    const buttonRow = contentEl.createDiv({ cls: "ogenda-form-buttons" });
    if (this.existing && this.onViewInNote) {
      const viewBtn = buttonRow.createEl("button", { text: "在笔记中查看" });
      viewBtn.addEventListener("click", () => {
        this.close();
        this.onViewInNote!();
      });
    }
    if (this.existing && this.onDelete) {
      const delBtn = buttonRow.createEl("button", { text: "删除" });
      delBtn.addEventListener("click", () => {
        this.close();
        this.onDelete!();
      });
    }
    const saveBtn = buttonRow.createEl("button", { text: "保存", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.handleSave());
  }

  private handleSave(): void {
    const result = validateEventForm(this.fields);
    if (!result.valid) {
      if (this.errorEl) this.errorEl.setText(result.errors.join("; "));
      return;
    }
    const event = buildEventFromFields(this.fields, this.existing, generateUid);
    this.close();
    this.onSubmit(event);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add src/agenda-panel/event-form-modal.ts
git commit -m "feat(v2): EventFormModal — create/edit form UI (wraps Task 9's pure logic)"
```

---

### Task 14: 集成 — `AgendaPanelView` 全面接入

**Files:**
- Modify: `src/agenda-panel/agenda-panel-view.ts`(整份重写——下面给的是完整文件内容)

无单测(Obsidian `ItemView` 集成边界,同项目一贯惯例;正确性靠 Task 16 真机验证)。

**Interfaces:**
- Consumes:全部前置任务的导出——`todayInTimezone`(3)、`computeStats`(5)、`renderStatsView`(6)、新签名 `renderListView(container, occurrences, onEventClick)`(7,少一个参数)、`renderMiniCalendar`(10)、`renderWeekView`/`renderMonthView` 的新 `onEmptyClick` 可选参(11)、`EventFormModal`(13);另外 `MonthlyStore.readEvents/sync/removeByUid`(已有)、`ConfirmationModal`(Obsidian,`minAppVersion` 已在 Task 12 提到 1.13.0)、`toDateKey`(`./date-grid`,已有导出)。
- Produces:`AgendaPanelView` 构造函数签名变为 `(leaf: WorkspaceLeaf, store: MonthlyStore, folder: string, timezone: string | undefined, triggerSync: () => void)`(比 v1 多两个参数)。Task 15(`main.ts`)要按这个新签名改调用处。

- [ ] **Step 1: 用下面的完整内容替换 `src/agenda-panel/agenda-panel-view.ts`**

```typescript
// src/agenda-panel/agenda-panel-view.ts
import { ItemView, WorkspaceLeaf, ConfirmationModal, Notice } from "obsidian";
import { AgendaEvent } from "../core/event";
import { LocalEvent, MonthlyStore } from "../store/monthly-store";
import { expandOccurrences } from "./occurrences";
import { startOfWeek, startOfDay, addDays, monthGridWeeks, toDateKey } from "./date-grid";
import { openEventSource } from "./navigate";
import { todayInTimezone } from "./timezone";
import { computeStats } from "./stats";
import { EventFormModal } from "./event-form-modal";
import { renderListView } from "./views/list-view";
import { renderDayView } from "./views/day-view";
import { renderWeekView } from "./views/week-view";
import { renderMonthView } from "./views/month-view";
import { renderStatsView } from "./views/stats-view";
import { renderMiniCalendar } from "./mini-calendar";

export const AGENDA_PANEL_VIEW_TYPE = "ogenda-agenda-panel";

type Tab = "list" | "day" | "week" | "month" | "stats";

export class AgendaPanelView extends ItemView {
  private tab: Tab = "list";
  private anchor: Date;

  constructor(
    leaf: WorkspaceLeaf,
    private store: MonthlyStore,
    private folder: string,
    private timezone: string | undefined,
    private triggerSync: () => void,
  ) {
    super(leaf);
    this.anchor = todayInTimezone(this.timezone);
  }

  getViewType(): string {
    return AGENDA_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Agenda";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  private rangeForTab(): { start: Date; end: Date } {
    if (this.tab === "day") {
      const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
      return { start, end: addDays(start, 1) };
    }
    if (this.tab === "week") {
      const start = startOfWeek(this.anchor);
      return { start, end: addDays(start, 7) };
    }
    if (this.tab === "month" || this.tab === "stats") {
      const weeks = monthGridWeeks(this.anchor);
      return { start: weeks[0][0], end: addDays(weeks[weeks.length - 1][6], 1) };
    }
    // list: from the anchor date onward, 60-day rolling window
    const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
    return { start, end: addDays(start, 60) };
  }

  private existingCategories(events: AgendaEvent[]): string[] {
    return [...new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort();
  }

  private async saveEvent(event: AgendaEvent): Promise<void> {
    await this.store.sync([event]);
    this.triggerSync();
    await this.render();
  }

  private confirmDelete(event: AgendaEvent): void {
    const modal = new ConfirmationModal(this.app);
    modal.setTitle("删除事件");
    modal.contentEl.createEl("p", { text: `确定删除《${event.title}》吗?这会同步删除 iCloud 上的对应事件。` });
    modal.addButton((btn) =>
      btn
        .setButtonText("删除")
        .setDestructive()
        .onClick(async () => {
          await this.store.removeByUid([event.uid]);
          this.triggerSync();
          await this.render();
        }),
    );
    modal.addCancelButton("取消");
    modal.open();
  }

  private async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("ogenda-panel");

    const head = container.createDiv({ cls: "ogenda-panel-head" });
    const tabs = head.createDiv({ cls: "ogenda-panel-tabs" });
    const tabDefs: { key: Tab; label: string }[] = [
      { key: "list", label: "清单" },
      { key: "day", label: "日" },
      { key: "week", label: "周" },
      { key: "month", label: "月" },
      { key: "stats", label: "统计" },
    ];
    for (const t of tabDefs) {
      const el = tabs.createDiv({ cls: "ogenda-panel-tab" + (this.tab === t.key ? " active" : ""), text: t.label });
      el.addEventListener("click", () => {
        this.tab = t.key;
        void this.render();
      });
    }

    const nav = head.createDiv({ cls: "ogenda-panel-nav" });
    const prev = nav.createSpan({ cls: "ogenda-navbtn", text: "‹" });
    prev.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(-1);
      void this.render();
    });
    const isToday = startOfDay(this.anchor).getTime() === startOfDay(todayInTimezone(this.timezone)).getTime();
    const todayBtn = nav.createSpan({
      cls: "ogenda-navbtn ogenda-navtoday",
      text: isToday ? `今天 · ${this.anchor.toDateString()}` : this.anchor.toDateString(),
    });
    todayBtn.addEventListener("click", () => {
      this.anchor = todayInTimezone(this.timezone);
      void this.render();
    });
    const next = nav.createSpan({ cls: "ogenda-navbtn", text: "›" });
    next.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(1);
      void this.render();
    });

    const body = container.createDiv({ cls: "ogenda-panel-body" });
    try {
      const local: LocalEvent[] = await this.store.readEvents();
      const events: AgendaEvent[] = local.map((l) => this.localToEvent(l));
      const categories = this.existingCategories(events);

      const newBtn = head.createDiv({ cls: "ogenda-panel-newbtn", text: "+ 新建" });
      newBtn.addEventListener("click", () => {
        new EventFormModal(
          this.app,
          null,
          toDateKey(this.anchor),
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
      });

      const onEventClick = (event: AgendaEvent) => {
        new EventFormModal(
          this.app,
          event,
          undefined,
          categories,
          (updated) => void this.saveEvent(updated),
          () => void openEventSource(this.app, this.folder, event),
          () => this.confirmDelete(event),
        ).open();
      };
      const onEmptyClick = (day: Date) => {
        new EventFormModal(
          this.app,
          null,
          toDateKey(day),
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
      };

      if (this.tab === "stats") {
        const { start } = this.rangeForTab();
        renderStatsView(body, computeStats(events, local, start));
      } else {
        const { start, end } = this.rangeForTab();
        const occurrences = expandOccurrences(events, start, end);
        if (this.tab === "list") renderListView(body, occurrences, onEventClick);
        else if (this.tab === "day") {
          const dayWrap = body.createDiv({ cls: "ogenda-day-layout" });
          const dayMain = dayWrap.createDiv({ cls: "ogenda-day-main" });
          const daySide = dayWrap.createDiv({ cls: "ogenda-day-side" });
          renderDayView(dayMain, occurrences, onEventClick);
          renderMiniCalendar(daySide, this.anchor, (day) => {
            this.anchor = day;
            void this.render();
          });
        } else if (this.tab === "week") renderWeekView(body, occurrences, this.anchor, onEventClick, onEmptyClick);
        else renderMonthView(body, occurrences, this.anchor, onEventClick, onEmptyClick);
      }
    } catch (e) {
      new Notice("Agenda 面板加载出错: " + (e as Error).message);
      console.error("[ogenda] agenda panel render error", e);
    }
  }

  private shiftAnchor(dir: 1 | -1): Date {
    if (this.tab === "day") return addDays(this.anchor, dir);
    if (this.tab === "week" || this.tab === "list") return addDays(this.anchor, dir * 7);
    const targetMonth = this.anchor.getMonth() + dir;
    const daysInTarget = new Date(this.anchor.getFullYear(), targetMonth + 1, 0).getDate();
    const day = Math.min(this.anchor.getDate(), daysInTarget);
    return new Date(this.anchor.getFullYear(), targetMonth, day);
  }

  // MonthlyStore.readEvents() 返回的是原始字段(LocalEvent),不是 AgendaEvent —— 面板只读展示,
  // 复用 store/monthly-store.ts 的字段命名(snake_case)转换成 AgendaEvent 展示用的最小子集。
  private localToEvent(local: LocalEvent): AgendaEvent {
    const f = local.fields;
    return {
      uid: local.uid,
      title: f.title ?? "",
      start: f.start ?? "",
      end: f.end,
      allDay: f.all_day === "true",
      location: f.location,
      organizer: f.organizer,
      attendees: f.attendees ? f.attendees.split(", ") : undefined,
      status: f.status,
      rsvp: f.rsvp,
      category: f.category,
      tags: f.tags ? f.tags.split(", ") : undefined,
      rrule: f.rrule,
      origin: "synced",
    };
  }
}
```

- [ ] **Step 2: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0

- [ ] **Step 3: 跑一次全量测试确认没有连带破坏**

Run: `npx vitest run`(若输出异常简短,改用 `node node_modules/vitest/vitest.mjs run`)
Expected: 全绿(这个文件本身无单测,但改动不应该破坏任何其它文件的测试)

- [ ] **Step 4: Commit**

```bash
git add src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v2): AgendaPanelView — CRUD entry points, stats tab, mini-calendar, status list"
```

---

### Task 15: 集成 — `main.ts` 接入新的构造参数

**Files:**
- Modify: `src/main.ts`

无单测(同 Task 14)。

**Interfaces:**
- Consumes:`AgendaPanelView` 的新构造签名(Task 14)。

- [ ] **Step 1: 实现**

`src/main.ts` 里现有这一行:

```typescript
    this.registerView(AGENDA_PANEL_VIEW_TYPE, (leaf) => new AgendaPanelView(leaf, this.store(), this.settings.storageFolder));
```

改成:

```typescript
    this.registerView(
      AGENDA_PANEL_VIEW_TYPE,
      (leaf) =>
        new AgendaPanelView(
          leaf,
          this.store(),
          this.settings.storageFolder,
          this.settings.timezone,
          () => void this.caldavSyncTwoWay(),
        ),
    );
```

(这一行是唯一需要改的地方——`caldavSyncTwoWay()` 是 `main.ts` 里已有的方法,原样复用,不新写同步逻辑;它自己的 try/catch 已经会在失败时弹 `Notice`,`AgendaPanelView` 侧不需要再包一层。)

- [ ] **Step 2: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0

- [ ] **Step 3: 跑一次全量测试 + 构建确认无回归**

Run: `npx vitest run && npm run build`(若 vitest 输出异常简短,先单独用 `node node_modules/vitest/vitest.mjs run` 复核)
Expected: 测试全绿;`npm run build` 成功退出(`tsc -noEmit -skipLibCheck && esbuild`)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(v2): wire timezone setting + sync-trigger callback into AgendaPanelView"
```

---

### Task 15.5(真机验证中发现的计划缺口补丁): 时区设置改成下拉列表

**背景:** Task 16 真机验证过程中用户反馈:时区设置不该是自由文本输入框,应该是下拉列表,每个选项格式"+xx:xx(代表城市)"(比如"+8:00(北京)"),默认选项是"跟随系统"(对应存储值仍是空字符串,语义不变——只是 UI 从文本框换成下拉)。用户还提到未来要做中英文界面切换,但明确这次 v2 分支范围之外,只要求这次数据结构上留出扩展余地(不是只存中文名一个字段)。

**Files:**
- Create: `src/settings/timezone-options.ts`
- Test: `tests/settings/timezone-options.test.ts`
- Modify: `src/settings/settings-tab.ts`(把时区那个 `Setting` 从 `.addText` 换成 `.addDropdown`)

**Interfaces:**
- Produces:
  ```typescript
  export interface TimezoneOption {
    iana: string;
    cityZh: string;
    cityEn: string;
    label: string; // e.g. "+8:00(北京)" — 当前固定用中文,数据结构里中英文都存着,为将来切语言留口子
  }
  export function buildTimezoneOptions(now: Date = new Date()): TimezoneOption[]
  ```
  `settings-tab.ts` 是唯一调用方,用返回的 `iana`/`label` 填充下拉框的 value/display。

- [ ] **Step 1: 写失败测试**

时区偏移量在夏令时期间会变(比如洛杉矶冬天 -8、夏天 -7),所以不能在列表里写死一个数字——`buildTimezoneOptions` 要在调用时根据传入的 `now` 现算每个城市当前的真实偏移量。测试用两个固定的、已知偏移量不受夏令时影响的城市(北京、东京,这两个地区都不实行夏令时,任何季节偏移量都固定)来验证格式,外加验证列表覆盖了主要的整点时区:

```typescript
// tests/settings/timezone-options.test.ts
import { describe, it, expect } from "vitest";
import { buildTimezoneOptions } from "../../src/settings/timezone-options";

describe("buildTimezoneOptions", () => {
  it("formats each option as '<+/-H:MM>(<city>)' using the current offset for the given instant", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const options = buildTimezoneOptions(now);
    const beijing = options.find((o) => o.iana === "Asia/Shanghai");
    expect(beijing?.label).toBe("+8:00(北京)");
    const tokyo = options.find((o) => o.iana === "Asia/Tokyo");
    expect(tokyo?.label).toBe("+9:00(东京)");
  });

  it("recomputes DST-affected offsets correctly across winter/summer", () => {
    const winter = buildTimezoneOptions(new Date("2026-01-15T12:00:00Z"));
    const summer = buildTimezoneOptions(new Date("2026-07-15T12:00:00Z"));
    const laWinter = winter.find((o) => o.iana === "America/Los_Angeles");
    const laSummer = summer.find((o) => o.iana === "America/Los_Angeles");
    expect(laWinter?.label).toBe("-8:00(洛杉矶)"); // PST
    expect(laSummer?.label).toBe("-7:00(洛杉矶)"); // PDT
  });

  it("covers a representative city for every major UTC offset from -8 to +9 without duplicate ianas", () => {
    const options = buildTimezoneOptions(new Date("2026-07-18T12:00:00Z"));
    const ianas = options.map((o) => o.iana);
    expect(new Set(ianas).size).toBe(ianas.length); // no duplicates
    for (const required of ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Shanghai", "Asia/Tokyo"]) {
      expect(ianas).toContain(required);
    }
  });

  it("each option carries both the Chinese and English city name, not just the rendered label", () => {
    const options = buildTimezoneOptions(new Date("2026-07-18T12:00:00Z"));
    const beijing = options.find((o) => o.iana === "Asia/Shanghai")!;
    expect(beijing.cityZh).toBe("北京");
    expect(beijing.cityEn).toBe("Beijing");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/settings/timezone-options.test.ts`(若输出异常简短,改用 `node node_modules/vitest/vitest.mjs run tests/settings/timezone-options.test.ts`)
Expected: FAIL — `Cannot find module '../../src/settings/timezone-options'`

- [ ] **Step 3: 实现**

```typescript
// src/settings/timezone-options.ts
interface CuratedZone {
  iana: string;
  cityZh: string;
  cityEn: string;
}

// 每个条目对应一个有代表性的城市,覆盖全球主要时区偏移量(整点为主,不含如尼泊尔 +5:45
// 这类极少见的 15 分钟偏移——这轮只做"有代表性",不追求穷举全部约 400 个 IANA 时区名)。
const CURATED_ZONES: CuratedZone[] = [
  { iana: "Pacific/Honolulu", cityZh: "檀香山", cityEn: "Honolulu" },
  { iana: "America/Anchorage", cityZh: "安克雷奇", cityEn: "Anchorage" },
  { iana: "America/Los_Angeles", cityZh: "洛杉矶", cityEn: "Los Angeles" },
  { iana: "America/Denver", cityZh: "丹佛", cityEn: "Denver" },
  { iana: "America/Chicago", cityZh: "芝加哥", cityEn: "Chicago" },
  { iana: "America/New_York", cityZh: "纽约", cityEn: "New York" },
  { iana: "America/Halifax", cityZh: "哈利法克斯", cityEn: "Halifax" },
  { iana: "America/Sao_Paulo", cityZh: "圣保罗", cityEn: "Sao Paulo" },
  { iana: "Atlantic/Azores", cityZh: "亚速尔", cityEn: "Azores" },
  { iana: "Europe/London", cityZh: "伦敦", cityEn: "London" },
  { iana: "Europe/Paris", cityZh: "巴黎", cityEn: "Paris" },
  { iana: "Europe/Athens", cityZh: "雅典", cityEn: "Athens" },
  { iana: "Europe/Moscow", cityZh: "莫斯科", cityEn: "Moscow" },
  { iana: "Asia/Dubai", cityZh: "迪拜", cityEn: "Dubai" },
  { iana: "Asia/Karachi", cityZh: "卡拉奇", cityEn: "Karachi" },
  { iana: "Asia/Kolkata", cityZh: "新德里", cityEn: "New Delhi" },
  { iana: "Asia/Dhaka", cityZh: "达卡", cityEn: "Dhaka" },
  { iana: "Asia/Bangkok", cityZh: "曼谷", cityEn: "Bangkok" },
  { iana: "Asia/Shanghai", cityZh: "北京", cityEn: "Beijing" },
  { iana: "Asia/Tokyo", cityZh: "东京", cityEn: "Tokyo" },
  { iana: "Australia/Adelaide", cityZh: "阿德莱德", cityEn: "Adelaide" },
  { iana: "Australia/Sydney", cityZh: "悉尼", cityEn: "Sydney" },
  { iana: "Pacific/Auckland", cityZh: "奥克兰", cityEn: "Auckland" },
];

function offsetMinutes(iana: string, now: Date): number {
  const partsFor = (tz: string): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  };
  return (partsFor(iana) - partsFor("UTC")) / 60000;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export interface TimezoneOption {
  iana: string;
  cityZh: string;
  cityEn: string;
  label: string;
}

export function buildTimezoneOptions(now: Date = new Date()): TimezoneOption[] {
  return CURATED_ZONES.map((z) => ({
    iana: z.iana,
    cityZh: z.cityZh,
    cityEn: z.cityEn,
    label: `${formatOffset(offsetMinutes(z.iana, now))}(${z.cityZh})`,
  }));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/settings/timezone-options.test.ts`
Expected: PASS(4/4)

- [ ] **Step 5: 把 `settings-tab.ts` 的时区输入框换成下拉**

`src/settings/settings-tab.ts` 里(Task 2 加的)那个"时区" `Setting` 块,从:

```typescript
    new Setting(containerEl)
      .setName("时区")
      .setDesc("IANA 时区名,如 Asia/Shanghai、America/Los_Angeles。留空 = 用电脑系统时区(默认行为)。")
      .addText((t) =>
        t.setValue(this.plugin.settings.timezone).onChange(async (v) => {
          this.plugin.settings.timezone = v.trim();
          await this.plugin.saveSettings();
        })
      );
```

改成:

```typescript
    new Setting(containerEl)
      .setName("时区")
      .setDesc("面板"今天"等日期判断依据的时区。选"跟随系统"= 用电脑当前时区(默认行为)。")
      .addDropdown((d) => {
        d.addOption("", "跟随系统");
        for (const opt of buildTimezoneOptions()) {
          d.addOption(opt.iana, opt.label);
        }
        d.setValue(this.plugin.settings.timezone);
        d.onChange(async (v) => {
          this.plugin.settings.timezone = v;
          await this.plugin.saveSettings();
        });
      });
```

文件顶部加一行 import:

```typescript
import { buildTimezoneOptions } from "./timezone-options";
```

- [ ] **Step 6: 类型检查 + 全量测试确认无回归**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck && npx vitest run`(若 `npx vitest` 输出异常简短,改用 `node node_modules/vitest/vitest.mjs run`)
Expected: tsc 0 错误;测试套件全绿,新增 4 条(timezone-options),其余不变

- [ ] **Step 7: Commit**

```bash
git add src/settings/timezone-options.ts tests/settings/timezone-options.test.ts src/settings/settings-tab.ts
git commit -m "feat(v2): timezone setting as a dropdown of representative cities per UTC offset"
```

---

### Task 16: 真机验证

- `npm run build` 后,把新的 `styles.css` 追加规则(见下方"样式补充"清单)一并加上、重载插件。
- **时区**:设置页填一个跟电脑当前系统时区不同的时区(比如系统是 PDT 就填 `Asia/Shanghai`),确认面板"今天"锚点、日/周/月视图的"今天"高亮跟着这个设置走,不受系统时区影响;留空后确认恢复成系统时区的行为。
- **新建**:点顶部"+ 新建",填标题+开始时间保存,确认(a)新事件出现在面板里,(b)月度文件里多了一个新 block(字段齐全、没有 href/etag/base_hash),(c)Notice 提示同步结果,(d)手动查 iCloud 日历确认这个事件真的建上了。
- **编辑**:点一个已有事件,改个字段保存,确认月度文件对应 block 更新、Notice 提示同步、iCloud 上也更新了。
- **删除**:点编辑表单里的删除按钮,确认弹出确认对话框;确认后事件从面板和月度文件消失,iCloud 上对应事件也被删除。
- **点空白格子新建**:周视图/月视图点一个没有事件的日期格子,确认弹出新建表单且日期已经预填对。
- **分类下拉**:确认下拉框里出现的是当前已有事件用过的所有分类;输入新分类保存后,下次打开新建表单这个分类应该出现在下拉里。
- **迷你日历**:日视图确认右侧有迷你月历,点其中一天,确认日/周/月视图的锚点日期跟着跳。
- **清单分组**:确认清单按 status 分组、组内按时间排序,点分组标题能折叠/展开。
- **统计**:切到"统计" tab,翻页到不同自然月,确认指标数字随月份变化、"未同步"计数在有本地未推送改动时非零。

真机验证完成后,汇总结果,准备进入最终整分支 code review。

## 样式补充(Task 14 完成后需要,追加进 `styles.css`,无独立任务编号——纯 CSS,随 Task 16 真机验证一起核对观感)

```css
.ogenda-panel-newbtn {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  font-size: 12px;
  margin-left: 8px;
}
.ogenda-navtoday { cursor: pointer; }

.ogenda-list-statusheader { cursor: pointer; font-weight: 600; padding: 6px 0; }
.ogenda-list-statusitems.collapsed { display: none; }

.ogenda-day-layout { display: flex; gap: 16px; }
.ogenda-day-main { flex: 1; min-width: 0; }
.ogenda-day-side { width: 220px; flex-shrink: 0; }

.ogenda-mini-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.ogenda-mini-cal-dow { text-align: center; font-size: 10px; color: var(--text-muted); }
.ogenda-mini-cal-cell { text-align: center; font-size: 11px; padding: 4px 0; border-radius: 4px; cursor: pointer; }
.ogenda-mini-cal-cell:hover { background: var(--background-modifier-hover); }
.ogenda-mini-cal-othermonth { opacity: 0.35; }
.ogenda-mini-cal-selected { background: var(--interactive-accent); color: var(--text-on-accent); }

.ogenda-form-error { color: var(--text-error); font-size: 12px; min-height: 16px; }
.ogenda-form-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }

.ogenda-stat-section { margin-bottom: 16px; }
.ogenda-stat-heading { font-weight: 600; margin-bottom: 6px; }
.ogenda-stat-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
.ogenda-stat-value { color: var(--text-muted); }
```

## Self-Review 记录

- **Spec 覆盖**:spec §3(时区)→ Task 1-3;§4.1-4.3(CRUD 入口/表单/保存同步)→ Task 8/9/12/13/14;§4.4(分类)→ Task 9/13;§4.5(迷你日历)→ Task 10/14;§5(清单分组)→ Task 7;§6(月度统计)→ Task 4/5/6;§7(技术选型)→ 全程未引入新依赖,`Modal`/`ConfirmationModal`/`Intl.DateTimeFormat` 均已用 `obsidian.d.ts`/Node 内置验证过真实签名。全部覆盖,无遗漏。
- **占位符扫描**:所有步骤都给了完整代码(含 `EventFormModal`/`AgendaPanelView` 这种较大的 Obsidian 集成文件,也是完整实现而不是"仿照 xxx 写")。初稿里 `AgendaPanelView` 的 `Notice` 曾经写成 catch 块内动态 `import`、又在后面用文字说明"应该改成顶部静态 import"——这种"先给一份要改的代码,再用文字讲怎么改"的写法本身就是本技能明确要避免的占位符模式,发现后已直接改成顶部静态 `import { ..., Notice } from "obsidian"` 一步到位,不留旁注。
- **类型一致性**:`renderListView` 签名从 v1 的 4 参降到 3 参(Task 7),Task 14 的调用处已经对应改成 3 参,没有沿用旧签名。`renderWeekView`/`renderMonthView` 新增的第 5 参在 Task 11 定义、Task 14 使用,类型一致(`(day: Date) => void`,可选)。`AgendaPanelView` 构造函数从 3 参(v1)变成 5 参,Task 15 的 `main.ts` 调用处已同步更新。`AgendaStats` 接口在 Task 5 定义、Task 6 消费,字段名逐一对应。`RawFormFields`/`buildEventFromFields` 在 Task 9 定义、Task 13 消费,字段名逐一对应。
