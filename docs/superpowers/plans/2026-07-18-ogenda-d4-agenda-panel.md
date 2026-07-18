# ogenda D4-UI — Agenda 面板(清单/日/周/月只读展示) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Obsidian 主编辑区新增一个只读的"Agenda 面板"(清单/日/周/月四个 tab),浏览已同步的 CalDAV 事件,点事件跳转到其所在月度笔记文件的对应章节。

**Architecture:** 一个新的 Obsidian `ItemView` 子类,主编辑区标签页打开。数据完全来自已有的 `MonthlyStore.readEvents()`(只读,不新增存储);循环事件按 `rrule` 在渲染时展开成具体出现(纯计算,不落盘)。四个子视图各自是一个纯函数(输入事件数据 + 容器 DOM,原生 DOM API 构建内容),可用 jsdom 单测;点击事件的"跳转到笔记"逻辑是唯一依赖 Obsidian `App` API 的部分,单独抽出、不写单测(跟 `ObsidianFileStore`/`CalDavConnector` 同一惯例,真机验证)。

**Tech Stack:** TypeScript(现有),`ical.js`(现有依赖,复用其 RRULE 解析),Obsidian Plugin API(`ItemView`/`Editor`/`MetadataCache`),vitest + jsdom(`// @vitest-environment jsdom`,项目已有先例见 `tests/connectors/caldav/parse-report.test.ts`)。

## Global Constraints
- 这轮**只读展示**,不做编辑、不做"事件详情"弹窗——点事件直接跳原始笔记(spec §5)。
- 循环事件展开复用项目已有依赖 `ical.js`,不引入 `rrule.js` 等新依赖(spec §6)。
- 渲染用原生 DOM API,不引入 UI 框架(spec §6)。
- 同步元数据字段(`uid`/`href`/`etag`/`base_hash`/`origin`/`source`/`protocol`/`server_deleted`)在任何视图里都不显示(spec §4.2)。
- 月视图格子里每条事件都用缩略标题条完整显示,不折叠成"+N"、不用圆点(spec §4.4)。
- 面板不改动、不新增任何持久化结构——月度文件继续是唯一数据源(spec §1)。

---

### Task 1: 循环事件展开(occurrences.ts)

**Files:**
- Create: `src/agenda-panel/occurrences.ts`
- Test: `tests/agenda-panel/occurrences.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent`(`src/core/event.ts`,已有字段 `uid`/`title`/`start`/`end`/`allDay`/`rrule`)
- Produces:
  ```typescript
  export interface EventOccurrence {
    event: AgendaEvent;
    start: string;
    end?: string;
  }
  export function expandOccurrences(events: AgendaEvent[], rangeStart: Date, rangeEnd: Date): EventOccurrence[]
  ```
  后续所有视图渲染任务都消费 `EventOccurrence[]`,按 `start` 升序排列。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/occurrences.test.ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { expandOccurrences } from "../../src/agenda-panel/occurrences";

const mk = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1", title: "会议", start: "2026-07-06T14:00:00", origin: "synced", ...o,
});

describe("expandOccurrences", () => {
  it("passes a non-recurring event through unchanged when inside the range", () => {
    const ev = mk({ end: "2026-07-06T15:00:00" });
    const out = expandOccurrences([ev], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out).toEqual([{ event: ev, start: "2026-07-06T14:00:00", end: "2026-07-06T15:00:00" }]);
  });

  it("drops a non-recurring event outside the range", () => {
    const ev = mk({ start: "2026-08-01T09:00:00" });
    const out = expandOccurrences([ev], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out).toEqual([]);
  });

  it("expands a weekly recurring event into each occurrence within the range", () => {
    const ev = mk({ end: "2026-07-06T15:00:00", rrule: "FREQ=WEEKLY;BYDAY=MO" });
    const out = expandOccurrences([ev], new Date("2026-07-13"), new Date("2026-07-28"));
    expect(out).toEqual([
      { event: ev, start: "2026-07-13T14:00:00", end: "2026-07-13T15:00:00" },
      { event: ev, start: "2026-07-20T14:00:00", end: "2026-07-20T15:00:00" },
      { event: ev, start: "2026-07-27T14:00:00", end: "2026-07-27T15:00:00" },
    ]);
  });

  it("expands an all-day recurring event using date-only occurrence strings", () => {
    const ev = mk({ start: "2026-07-01", allDay: true, rrule: "FREQ=MONTHLY;COUNT=3" });
    const out = expandOccurrences([ev], new Date("2026-06-01"), new Date("2026-10-01"));
    expect(out.map((o) => o.start)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  it("handles a recurring event that started years before the visible range", () => {
    const ev = mk({ start: "2019-01-01T09:00:00", end: "2019-01-01T09:30:00", rrule: "FREQ=DAILY" });
    const out = expandOccurrences([ev], new Date("2026-07-13"), new Date("2026-07-20"));
    expect(out.length).toBe(7);
    expect(out[0].start).toBe("2026-07-13T09:00:00");
  });

  it("sorts all occurrences (across multiple events) by start ascending", () => {
    const a = mk({ uid: "a", start: "2026-07-10T09:00:00" });
    const b = mk({ uid: "b", start: "2026-07-05T09:00:00" });
    const out = expandOccurrences([a, b], new Date("2026-07-01"), new Date("2026-07-31"));
    expect(out.map((o) => o.event.uid)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/occurrences.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/occurrences'`

- [ ] **Step 3: 写实现**

已用 vitest 手动验证过下面这段 `ical.js` RRULE 迭代/加时长的用法是正确的(`ICAL.Time.fromDateTimeString`/`fromDateString`、`Recur.iterator`、`.subtractDate`/`.addDuration`/`.clone`/`.toJSDate`/`.toString`)。安全上限用 10000(不是几百)——因为一个"几年前开始、天天重复"的事件,光是从起始日期跳到今天可见范围就要几千次迭代,上限太小会导致老的循环事件在新的可见范围里"跳不到"。

```typescript
// src/agenda-panel/occurrences.ts
import ICAL from "ical.js";
import { AgendaEvent } from "../core/event";

export interface EventOccurrence {
  event: AgendaEvent;
  start: string;
  end?: string;
}

const MAX_ITERATIONS = 10000;

function toIcalTime(iso: string, allDay: boolean | undefined): ICAL.Time {
  return allDay ? ICAL.Time.fromDateString(iso) : ICAL.Time.fromDateTimeString(iso);
}

export function expandOccurrences(
  events: AgendaEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const out: EventOccurrence[] = [];

  for (const ev of events) {
    if (!ev.rrule) {
      const occStart = new Date(ev.start);
      if (occStart >= rangeStart && occStart < rangeEnd) {
        out.push({ event: ev, start: ev.start, end: ev.end });
      }
      continue;
    }

    const dtstart = toIcalTime(ev.start, ev.allDay);
    const duration = ev.end ? toIcalTime(ev.end, ev.allDay).subtractDate(dtstart) : null;
    const recur = ICAL.Recur.fromString(ev.rrule);
    const iter = recur.iterator(dtstart);

    let next = iter.next();
    let count = 0;
    while (next && count < MAX_ITERATIONS) {
      count++;
      const occStart = next.toJSDate();
      if (occStart >= rangeEnd) break;
      if (occStart >= rangeStart) {
        let endStr: string | undefined;
        if (duration) {
          const occEnd = next.clone();
          occEnd.addDuration(duration);
          endStr = occEnd.toString();
        }
        out.push({ event: ev, start: next.toString(), end: endStr });
      }
      next = iter.next();
    }
  }

  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/occurrences.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/occurrences.ts tests/agenda-panel/occurrences.test.ts
git commit -m "feat(d4-ui): expand recurring events into occurrences for display (D4-UI.1)"
```

---

### Task 2: 日期/日历网格工具(date-grid.ts)

**Files:**
- Create: `src/agenda-panel/date-grid.ts`
- Test: `tests/agenda-panel/date-grid.test.ts`

**Interfaces:**
- Consumes: `EventOccurrence`(Task 1)
- Produces:
  ```typescript
  export function toDateKey(d: Date): string
  export function startOfDay(d: Date): Date
  export function addDays(d: Date, n: number): Date
  export function startOfWeek(d: Date): Date
  export function monthGridWeeks(anchor: Date): Date[][]
  export function groupByDay(occurrences: EventOccurrence[]): { date: Date; items: EventOccurrence[] }[]
  ```
  周视图(Task 6)用 `startOfWeek`;月视图(Task 7)用 `monthGridWeeks`;清单视图(Task 4)用 `groupByDay`。

- [ ] **Step 1: 写失败测试**

2026 年 7 月的星期分布已核实(7 月 1 日是周三,7 月 31 日是周五):

```typescript
// tests/agenda-panel/date-grid.test.ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { EventOccurrence } from "../../src/agenda-panel/occurrences";
import { toDateKey, startOfDay, addDays, startOfWeek, monthGridWeeks, groupByDay } from "../../src/agenda-panel/date-grid";

describe("date-grid", () => {
  it("toDateKey formats as YYYY-MM-DD", () => {
    expect(toDateKey(new Date(2026, 6, 6))).toBe("2026-07-06");
  });

  it("startOfDay strips the time component", () => {
    expect(startOfDay(new Date(2026, 6, 18, 15, 30))).toEqual(new Date(2026, 6, 18));
  });

  it("addDays shifts by N days, including across month boundaries", () => {
    expect(addDays(new Date(2026, 6, 30), 3)).toEqual(new Date(2026, 7, 2));
  });

  it("startOfWeek returns the Monday of the week containing the date", () => {
    // 2026-07-18 is a Saturday
    expect(startOfWeek(new Date(2026, 6, 18))).toEqual(new Date(2026, 6, 13));
  });

  it("startOfWeek is a no-op when the date is already a Monday", () => {
    // 2026-07-13 is a Monday
    expect(startOfWeek(new Date(2026, 6, 13))).toEqual(new Date(2026, 6, 13));
  });

  it("monthGridWeeks builds a Monday-first grid covering July 2026 with padding days", () => {
    const weeks = monthGridWeeks(new Date(2026, 6, 15)); // any date in July
    expect(weeks.length).toBe(5);
    expect(weeks[0][0]).toEqual(new Date(2026, 5, 29)); // Mon, from June
    expect(weeks[0][2]).toEqual(new Date(2026, 6, 1));  // Wed, first of July
    expect(weeks[4][4]).toEqual(new Date(2026, 6, 31)); // Fri, last of July
    expect(weeks[4][6]).toEqual(new Date(2026, 7, 2));  // Sun, into August
  });

  it("groupByDay groups occurrences by calendar day and sorts groups ascending", () => {
    const ev = (uid: string): AgendaEvent => ({ uid, title: "t", start: "x", origin: "synced" });
    const occs: EventOccurrence[] = [
      { event: ev("b"), start: "2026-07-20T09:00:00" },
      { event: ev("a"), start: "2026-07-18T09:00:00" },
      { event: ev("c"), start: "2026-07-18T14:00:00" },
    ];
    const groups = groupByDay(occs);
    expect(groups.length).toBe(2);
    expect(groups[0].date).toEqual(new Date(2026, 6, 18));
    expect(groups[0].items.map((o) => o.event.uid)).toEqual(["a", "c"]);
    expect(groups[1].date).toEqual(new Date(2026, 6, 20));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/date-grid.test.ts`
Expected: FAIL — `Cannot find module '../../src/agenda-panel/date-grid'`

- [ ] **Step 3: 写实现**

```typescript
// src/agenda-panel/date-grid.ts
import { EventOccurrence } from "./occurrences";

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday-first start of the week containing d. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = (day.getDay() + 6) % 7; // JS getDay(): 0=Sun..6=Sat -> 0=Mon..6=Sun
  return addDays(day, -dow);
}

/** Monday-first weeks (each 7 consecutive days) covering the calendar month containing anchor. */
export function monthGridWeeks(anchor: Date): Date[][] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 7); // exclusive

  const weeks: Date[][] = [];
  for (let cursor = gridStart; cursor < gridEnd; cursor = addDays(cursor, 7)) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(cursor, i));
    weeks.push(week);
  }
  return weeks;
}

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

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/date-grid.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/date-grid.ts tests/agenda-panel/date-grid.test.ts
git commit -m "feat(d4-ui): date-grid helpers for week/month grids and day-grouping (D4-UI.2)"
```

---

### Task 3: 点事件跳转到原始笔记(navigate.ts)

**Files:**
- Create: `src/agenda-panel/navigate.ts`(集成,无单测——同 `ObsidianFileStore`/`CalDavConnector` 惯例,依赖真实 Obsidian `App` API,这套测试环境里 mock 不了,真机验证见 Task 9)

**Interfaces:**
- Consumes: `AgendaEvent`;`monthOf`(`src/store/monthly-store.ts`,已导出);`eventHeading`(`src/core/monthly-doc.ts`,已导出)
- Produces: `export async function openEventSource(app: App, folder: string, event: AgendaEvent): Promise<void>` —— Task 8(AgendaPanelView)拿这个函数包成每个渲染器需要的 `onEventClick` 回调。

- [ ] **Step 1: 写实现**(无单测任务,不走 RED→GREEN;类型已对照 `node_modules/obsidian/obsidian.d.ts` 核实过 `MarkdownView.editor`/`HeadingCache`/`CacheItem.position`/`Editor.setCursor`/`Editor.scrollIntoView` 的确切签名)

```typescript
// src/agenda-panel/navigate.ts
import { App, MarkdownView, TFile, normalizePath } from "obsidian";
import { AgendaEvent } from "../core/event";
import { eventHeading } from "../core/monthly-doc";
import { monthOf } from "../store/monthly-store";

/** Opens the monthly file containing `event` and scrolls to its heading, if found. */
export async function openEventSource(app: App, folder: string, event: AgendaEvent): Promise<void> {
  const path = normalizePath(`${folder}/${monthOf(event.start)}.md`);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;

  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  const heading = eventHeading(event);
  const cache = app.metadataCache.getFileCache(file);
  const headingCache = cache?.headings?.find((h) => h.heading === heading);
  if (!headingCache) return;

  const view = leaf.view;
  if (view instanceof MarkdownView) {
    const pos = { line: headingCache.position.start.line, ch: 0 };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
}
```

- [ ] **Step 2: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0,无错误(用本地 `tsc` 二进制,不用 `npx tsc`——见 README/CLAUDE 里记录过 `npx` 有时解析到不匹配的 TypeScript 版本)

- [ ] **Step 3: Commit**

```bash
git add src/agenda-panel/navigate.ts
git commit -m "feat(d4-ui): jump to an event's source note + heading on click (D4-UI.3)"
```

---

### Task 4: 清单视图渲染(list-view.ts)

**Files:**
- Create: `src/agenda-panel/views/list-view.ts`
- Test: `tests/agenda-panel/views/list-view.test.ts`

**Interfaces:**
- Consumes: `EventOccurrence`(Task 1)、`groupByDay`/`toDateKey`(Task 2)
- Produces: `export function renderListView(container: HTMLElement, occurrences: EventOccurrence[], today: Date, onEventClick: (event: AgendaEvent) => void): void`
  —— 用纯 DOM API(`document.createElement`,不用 Obsidian 的 `createEl` 语法糖)构建内容,这样能用 jsdom 直接单测,不依赖真实 Obsidian 环境。`onEventClick` 由调用方(Task 8)注入,渲染器本身不直接依赖 `App`。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/views/list-view.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderListView } from "../../../src/agenda-panel/views/list-view";

const mkOcc = (uid: string, start: string, title: string, location?: string): EventOccurrence => ({
  event: { uid, title, start, location, origin: "synced" },
  start,
});

describe("renderListView", () => {
  it("groups occurrences by day and renders title/location", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-18T10:00:00", "周会同步", "线上"),
      mkOcc("b", "2026-07-20T14:00:00", "项目评审", "会议室 B"),
    ];
    renderListView(container, occs, new Date(2026, 6, 18), () => {});

    const groups = container.querySelectorAll(".ogenda-list-daygroup");
    expect(groups.length).toBe(2);
    expect(container.textContent).toContain("周会同步");
    expect(container.textContent).toContain("线上");
    expect(container.textContent).toContain("项目评审");
  });

  it("calls onEventClick with the underlying AgendaEvent when a row is clicked", () => {
    const container = document.createElement("div");
    const occ = mkOcc("a", "2026-07-18T10:00:00", "周会同步");
    const onClick = vi.fn();
    renderListView(container, [occ], new Date(2026, 6, 18), onClick);

    const row = container.querySelector(".ogenda-event-row") as HTMLElement;
    row.click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });

  it("renders nothing but no error for an empty occurrence list", () => {
    const container = document.createElement("div");
    expect(() => renderListView(container, [], new Date(2026, 6, 18), () => {})).not.toThrow();
    expect(container.querySelectorAll(".ogenda-list-daygroup").length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts`
Expected: FAIL — `Cannot find module '../../../src/agenda-panel/views/list-view'`

- [ ] **Step 3: 写实现**

```typescript
// src/agenda-panel/views/list-view.ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { groupByDay } from "../date-grid";

function formatDayLabel(d: Date, today: Date): string {
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameDay ? `今天 · ${dateStr} ${weekday}` : `${dateStr} ${weekday}`;
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
  today: Date,
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  for (const group of groupByDay(occurrences)) {
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-daygroup";

    const label = document.createElement("div");
    label.className = "ogenda-list-daylabel";
    label.textContent = formatDayLabel(group.date, today);
    groupEl.appendChild(label);

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

      groupEl.appendChild(row);
    }
    container.appendChild(groupEl);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/views/list-view.ts tests/agenda-panel/views/list-view.test.ts
git commit -m "feat(d4-ui): list view — chronological agenda grouped by day (D4-UI.4)"
```

---

### Task 5: 日视图渲染(day-view.ts)

**Files:**
- Create: `src/agenda-panel/views/day-view.ts`
- Test: `tests/agenda-panel/views/day-view.test.ts`

**Interfaces:**
- Consumes: `EventOccurrence`(Task 1)
- Produces: `export function renderDayView(container: HTMLElement, occurrences: EventOccurrence[], onEventClick: (event: AgendaEvent) => void): void`

字段展示规则(spec §4.2):标题、时间、地点、说明(`description` —— 注:`AgendaEvent` 目前没有这个字段,不展示;若某字段值不存在,整行不渲染)、组织者(`organizer`)、参与人(`attendees`,数组 join 顿号)、状态(`status`)、RSVP(`rsvp`)、分类(`category`)、标签(`tags`,数组 join 顿号)、重复规则(`rrule`,原样显示字符串——这轮不做人类可读翻译,YAGNI)。**不显示** `uid`/`href`/`etag`/`base_hash`/`origin`/`source`/`protocol`/`server_deleted`。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/views/day-view.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderDayView } from "../../../src/agenda-panel/views/day-view";

describe("renderDayView", () => {
  it("renders all present calendar fields but omits absent ones and sync metadata", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "团队周会", start: "2026-07-16T14:00:00", end: "2026-07-16T15:00:00",
      allDay: false, location: "会议室 A", organizer: "alice@example.com",
      attendees: ["alice@example.com", "bob@example.com"], status: "confirmed", rsvp: "accepted",
      origin: "synced", href: "https://example.com/a.ics", etag: '"e1"',
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start, end: ev.end }], () => {});

    expect(container.textContent).toContain("团队周会");
    expect(container.textContent).toContain("会议室 A");
    expect(container.textContent).toContain("alice@example.com");
    expect(container.textContent).toContain("confirmed");
    expect(container.textContent).toContain("accepted");
    expect(container.textContent).not.toContain("https://example.com/a.ics");
    expect(container.textContent).not.toContain('"e1"');
  });

  it("omits a field row entirely when the field is absent (no empty label)", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "全员大会", start: "2026-07-20", allDay: true, origin: "synced" };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {});
    expect(container.querySelectorAll(".ogenda-field-row").length).toBe(0);
  });

  it("calls onEventClick when a card is clicked", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "会议", start: "2026-07-16T14:00:00", origin: "synced" };
    const container = document.createElement("div");
    const onClick = vi.fn();
    renderDayView(container, [{ event: ev, start: ev.start }], onClick);
    (container.querySelector(".ogenda-day-card") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(ev);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/day-view.test.ts`
Expected: FAIL — `Cannot find module '../../../src/agenda-panel/views/day-view'`

- [ ] **Step 3: 写实现**

```typescript
// src/agenda-panel/views/day-view.ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";

function addField(grid: HTMLElement, label: string, value: string | undefined): void {
  if (!value) return;
  const row = document.createElement("div");
  row.className = "ogenda-field-row";
  const k = document.createElement("span");
  k.className = "ogenda-field-key";
  k.textContent = label;
  const v = document.createElement("span");
  v.className = "ogenda-field-value";
  v.textContent = value;
  row.appendChild(k);
  row.appendChild(v);
  grid.appendChild(row);
}

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
  const e = hhmm(occ.end);
  return e ? `${hhmm(occ.start)}–${e}` : hhmm(occ.start);
}

export function renderDayView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  for (const occ of occurrences) {
    const ev = occ.event;
    const card = document.createElement("div");
    card.className = "ogenda-day-card";
    card.addEventListener("click", () => onEventClick(ev));

    const time = document.createElement("div");
    time.className = "ogenda-day-time";
    time.textContent = formatTime(occ);
    card.appendChild(time);

    const title = document.createElement("div");
    title.className = "ogenda-day-title";
    title.textContent = ev.title;
    card.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "ogenda-field-grid";
    addField(grid, "地点", ev.location);
    addField(grid, "组织者", ev.organizer);
    addField(grid, "参与人", ev.attendees?.length ? ev.attendees.join("、") : undefined);
    addField(grid, "状态", ev.status);
    addField(grid, "RSVP", ev.rsvp);
    addField(grid, "分类", ev.category);
    addField(grid, "标签", ev.tags?.length ? ev.tags.join("、") : undefined);
    addField(grid, "重复规则", ev.rrule);
    card.appendChild(grid);

    container.appendChild(card);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/day-view.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/views/day-view.ts tests/agenda-panel/views/day-view.test.ts
git commit -m "feat(d4-ui): day view — full calendar fields, no sync metadata (D4-UI.5)"
```

---

### Task 6: 周视图渲染(week-view.ts)

**Files:**
- Create: `src/agenda-panel/views/week-view.ts`
- Test: `tests/agenda-panel/views/week-view.test.ts`

**Interfaces:**
- Consumes: `EventOccurrence`(Task 1)、`startOfWeek`/`addDays`/`startOfDay`(Task 2)
- Produces: `export function renderWeekView(container: HTMLElement, occurrences: EventOccurrence[], anchor: Date, onEventClick: (event: AgendaEvent) => void): void`

7 天一列(周一到周日,`startOfWeek(anchor)` 起 7 天),每列内事件卡片式(时间+标题+地点),按 brainstorming 结论——不做精确到小时的时间网格。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/views/week-view.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderWeekView } from "../../../src/agenda-panel/views/week-view";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

describe("renderWeekView", () => {
  it("renders 7 day columns, each with its own events", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("2026-07-13T14:00:00", "周一的会"), mkOcc("2026-07-18T09:00:00", "周六的会")];
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

  it("calls onEventClick with the underlying AgendaEvent", () => {
    const container = document.createElement("div");
    const occ = mkOcc("2026-07-13T14:00:00", "周一的会");
    const onClick = vi.fn();
    renderWeekView(container, [occ], new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-week-card") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts`
Expected: FAIL — `Cannot find module '../../../src/agenda-panel/views/week-view'`

- [ ] **Step 3: 写实现**

```typescript
// src/agenda-panel/views/week-view.ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { startOfWeek, startOfDay, addDays } from "../date-grid";

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  return occ.start.slice(11, 16);
}

export function renderWeekView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const grid = document.createElement("div");
  grid.className = "ogenda-week-grid";

  for (const day of days) {
    const col = document.createElement("div");
    col.className = "ogenda-week-col";

    const dayOccs = occurrences.filter((occ) => startOfDay(new Date(occ.start)).getTime() === day.getTime());
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

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/views/week-view.ts tests/agenda-panel/views/week-view.test.ts
git commit -m "feat(d4-ui): week view — 7-day grid, card-style entries per day (D4-UI.6)"
```

---

### Task 7: 月视图渲染(month-view.ts)

**Files:**
- Create: `src/agenda-panel/views/month-view.ts`
- Test: `tests/agenda-panel/views/month-view.test.ts`

**Interfaces:**
- Consumes: `EventOccurrence`(Task 1)、`monthGridWeeks`/`startOfDay`(Task 2)
- Produces: `export function renderMonthView(container: HTMLElement, occurrences: EventOccurrence[], anchor: Date, onEventClick: (event: AgendaEvent) => void): void`

每个格子里每条事件都是一条缩略标题条(class `ogenda-month-mini`),不折叠、不用圆点(spec §4.4)——用 CSS 让格子按内容自动撑高(`height: auto`/`min-height`,不设固定高度),这部分是样式层的事,不在这个渲染函数的 DOM 结构测试范围内,但结构必须保证"每条事件各自一个 `.ogenda-month-mini` 元素"而不是合并成一个摘要,这样 CSS 才能正常撑开。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/agenda-panel/views/month-view.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderMonthView } from "../../../src/agenda-panel/views/month-view";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

describe("renderMonthView", () => {
  it("renders a 7x5 grid for July 2026 with day numbers, including padding days", () => {
    const container = document.createElement("div");
    renderMonthView(container, [], new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    expect(cells.length).toBe(35); // 5 weeks
    expect(cells[2].textContent).toContain("1"); // Wed = July 1
  });

  it("marks padding days from adjacent months with a distinct class", () => {
    const container = document.createElement("div");
    renderMonthView(container, [], new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    expect(cells[0].classList.contains("ogenda-month-othermonth")).toBe(true); // June 29
    expect(cells[2].classList.contains("ogenda-month-othermonth")).toBe(false); // July 1
  });

  it("renders one mini-title element per event on a day, not folded/truncated", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("2026-07-06T09:00:00", "早会"), mkOcc("2026-07-06T14:00:00", "晚会")];
    renderMonthView(container, occs, new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    const july6 = cells[9]; // Mon 6/29 is index 0 -> July 6 is the 8th day -> index 8... see note below
    // July 6, 2026 is a Monday, the first Monday fully inside July -> row 1 (0-indexed), col 0 -> index 7
    const minis = container.querySelectorAll(".ogenda-month-mini");
    expect(minis.length).toBe(2);
    expect([...minis].map((m) => m.textContent)).toEqual(["早会", "晚会"]);
  });

  it("calls onEventClick with the underlying AgendaEvent", () => {
    const container = document.createElement("div");
    const occ = mkOcc("2026-07-06T09:00:00", "早会");
    const onClick = vi.fn();
    renderMonthView(container, [occ], new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-month-mini") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/agenda-panel/views/month-view.test.ts`
Expected: FAIL — `Cannot find module '../../../src/agenda-panel/views/month-view'`

- [ ] **Step 3: 写实现**

```typescript
// src/agenda-panel/views/month-view.ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { monthGridWeeks, startOfDay } from "../date-grid";

export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();

  const grid = document.createElement("div");
  grid.className = "ogenda-month-grid";

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-month-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-month-othermonth");

      const num = document.createElement("div");
      num.className = "ogenda-month-daynum";
      num.textContent = String(day.getDate());
      cell.appendChild(num);

      const dayOccs = occurrences.filter((occ) => startOfDay(new Date(occ.start)).getTime() === day.getTime());
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

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/agenda-panel/views/month-view.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/views/month-view.ts tests/agenda-panel/views/month-view.test.ts
git commit -m "feat(d4-ui): month view — weekday grid, full mini-title labels, no folding (D4-UI.7)"
```

---

### Task 8: AgendaPanelView(ItemView)+ main.ts 接入

**Files:**
- Create: `src/agenda-panel/agenda-panel-view.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `MonthlyStore.readEvents()`(已有)、`expandOccurrences`(Task 1)、`renderListView`/`renderDayView`/`renderWeekView`/`renderMonthView`(Task 4-7)、`openEventSource`(Task 3)、`startOfWeek`/`monthGridWeeks`(Task 2,用于计算每个 tab 当前该取的数据范围)
- Produces:
  ```typescript
  export const AGENDA_PANEL_VIEW_TYPE = "ogenda-agenda-panel";
  export class AgendaPanelView extends ItemView { ... }
  ```

无单测(集成 Obsidian `ItemView`/`Workspace` API,同 Task 3 的约定;正确性靠 Task 9 真机验证)。

- [ ] **Step 1: 实现 AgendaPanelView**

```typescript
// src/agenda-panel/agenda-panel-view.ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import { AgendaEvent } from "../core/event";
import { MonthlyStore } from "../store/monthly-store";
import { expandOccurrences } from "./occurrences";
import { startOfWeek, addDays, monthGridWeeks } from "./date-grid";
import { openEventSource } from "./navigate";
import { renderListView } from "./views/list-view";
import { renderDayView } from "./views/day-view";
import { renderWeekView } from "./views/week-view";
import { renderMonthView } from "./views/month-view";

export const AGENDA_PANEL_VIEW_TYPE = "ogenda-agenda-panel";

type Tab = "list" | "day" | "week" | "month";

export class AgendaPanelView extends ItemView {
  private tab: Tab = "list";
  private anchor: Date = new Date();

  constructor(leaf: WorkspaceLeaf, private store: MonthlyStore, private folder: string) {
    super(leaf);
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
    if (this.tab === "month") {
      const weeks = monthGridWeeks(this.anchor);
      return { start: weeks[0][0], end: addDays(weeks[weeks.length - 1][6], 1) };
    }
    // list: today onward, 60-day rolling window
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    return { start, end: addDays(start, 60) };
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
    nav.createSpan({ text: this.anchor.toDateString() });
    const next = nav.createSpan({ cls: "ogenda-navbtn", text: "›" });
    next.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(1);
      void this.render();
    });

    const body = container.createDiv({ cls: "ogenda-panel-body" });
    const { start, end } = this.rangeForTab();
    const events: AgendaEvent[] = await this.store.readEvents().then((local) =>
      local.map((l) => this.localToEvent(l)),
    );
    const occurrences = expandOccurrences(events, start, end);
    const onEventClick = (event: AgendaEvent) => void openEventSource(this.app, this.folder, event);

    if (this.tab === "list") renderListView(body, occurrences, new Date(), onEventClick);
    else if (this.tab === "day") renderDayView(body, occurrences, onEventClick);
    else if (this.tab === "week") renderWeekView(body, occurrences, this.anchor, onEventClick);
    else renderMonthView(body, occurrences, this.anchor, onEventClick);
  }

  private shiftAnchor(dir: 1 | -1): Date {
    if (this.tab === "day") return addDays(this.anchor, dir);
    if (this.tab === "week") return addDays(this.anchor, dir * 7);
    return new Date(this.anchor.getFullYear(), this.anchor.getMonth() + dir, this.anchor.getDate());
  }

  // MonthlyStore.readEvents() 返回的是原始字段(LocalEvent),不是 AgendaEvent —— 面板只读展示,
  // 复用 store/monthly-store.ts 的字段命名(snake_case)转换成 AgendaEvent 展示用的最小子集。
  private localToEvent(local: { uid: string; fields: Record<string, string> }): AgendaEvent {
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

- [ ] **Step 2: main.ts 注册视图 + 打开命令**

在 `src/main.ts` 顶部 import 区加:

```typescript
import { AgendaPanelView, AGENDA_PANEL_VIEW_TYPE } from "./agenda-panel/agenda-panel-view";
```

在 `onload()` 里(跟现有 `this.addCommand(...)` 那几行放一起)加:

```typescript
this.registerView(AGENDA_PANEL_VIEW_TYPE, (leaf) => new AgendaPanelView(leaf, this.store(), this.settings.storageFolder));
this.addCommand({
  id: "ogenda-open-agenda-panel",
  name: "Open Agenda panel",
  callback: () => void this.openAgendaPanel(),
});
```

在类里加一个方法(跟 `caldavSyncTwoWay` 那些方法放一起):

```typescript
async openAgendaPanel(): Promise<void> {
  const existing = this.app.workspace.getLeavesOfType(AGENDA_PANEL_VIEW_TYPE);
  if (existing.length > 0) {
    await this.app.workspace.revealLeaf(existing[0]);
    return;
  }
  const leaf = this.app.workspace.getLeaf(true);
  await leaf.setViewState({ type: AGENDA_PANEL_VIEW_TYPE, active: true });
  await this.app.workspace.revealLeaf(leaf);
}
```

- [ ] **Step 3: 类型检查确认编译通过**

Run: `./node_modules/.bin/tsc -noEmit -skipLibCheck`
Expected: exit 0

- [ ] **Step 4: 跑一次全量测试确认没有连带破坏**

Run: `npx vitest run`
Expected: 之前全部测试 + Task 1/2/4/5/6/7 新增的测试全部 PASS,无 FAIL

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/agenda-panel-view.ts src/main.ts
git commit -m "feat(d4-ui): AgendaPanelView — wire tabs/nav/render + open-panel command (D4-UI.8)"
```

---

### Task 9: 真机验证

- 用 demo-vault:`npm run build` 后重载插件,跑 "Open Agenda panel" 命令。
- 清单:确认从今天起按天分组、正确显示已同步的真实事件(如 demo vault 里 2019 年那批历史事件在对应清单位置能看到,虽然默认 60 天窗口下大概率看不到 2019 年的——用日/周/月 tab 翻到该日期验证)。
- 月视图:翻到 2026-07,确认格子按星期对齐、事件多的格子有没有把标题条挤丢(对照 spec §4.4 的"不折叠"要求)。
- 点一个事件,确认跳转到对应月度文件、光标定位到正确的 `## 标题` 那一行。
- 如果 demo vault 里有循环事件(当前示例数据没有),手动在某个月度文件里加一条带 `- rrule:: FREQ=WEEKLY;BYDAY=MO` 的测试块,确认周视图/月视图翻页后每周一都能看到它。

---

## Self-Review 记录

- **Spec 覆盖**:spec §3 架构(ItemView+主编辑区)→ Task 8;§4.1 清单 → Task 4;§4.2 日 → Task 5;§4.3 周 → Task 6;§4.4 月 → Task 7;§5 点击跳转 → Task 3;§6 技术选型(ical.js 复用、无框架)→ Task 1 + 全部渲染任务用原生 DOM。全部覆盖,无遗漏。
- **占位符扫描**:所有代码块都是完整可运行代码(occurrences.ts 的 RRULE 用法已用 vitest 实测跑通;navigate.ts 的 Obsidian API 已逐个对照 `obsidian.d.ts` 核实签名)。唯一"留到实现时定"的是 Task 8 里 `localToEvent` 这个字段映射用的 snake_case key 名——这些已经是 `src/core/event.ts` 里 `eventToFields` 定义好的既有字段名,不是新发明的,不算占位符。
- **类型一致性**:`EventOccurrence`(Task 1 定义)在 Task 2/4/5/6/7/8 里签名一致;各渲染函数的 `onEventClick: (event: AgendaEvent) => void` 签名在 Task 4-8 里保持一致。
