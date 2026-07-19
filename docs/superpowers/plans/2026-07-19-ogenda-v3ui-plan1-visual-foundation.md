# ogenda v3-UI 计划一:视觉地基 + 清单/日视图 + 中文日期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 v3-UI 的视觉语言(配色模块、中文日期、em 相对字号、分段 Tab、A 风格卡片),并套用到清单视图与日视图,让面板"看起来精致、信息分层、日期中文"。

**Architecture:** 两个纯模块 `colors.ts`(状态色 + 分类色 hash 派色 + resolver)与 `date-format.ts`(中文日期)提供确定性的样式/格式化。`styles.css` 整体重写为 em 相对体系的"活泼信息化(A)"风格,一次覆盖全部视图/表单/Tab 的类。视图渲染函数新增一个**可选尾参** `colors: ColorResolver`(面板总会传;旧测试不传则内部用默认 resolver,保持绿)。清单、日视图套新样式;导航条锚点日期改中文。

**Tech Stack:** TypeScript、Obsidian API、vitest + jsdom、esbuild。

**这是三个计划中的第一个。** 计划二(周/月/统计视图 + 多月迷你日历)、计划三(表单原生选择器 + 3 个 bug + 设置分类色覆盖)都依赖本计划产出的 `colors.ts` / `date-format.ts` / `styles.css`。本计划自身即可交付:面板换新皮、有配色、中文日期、清单/日视图重塑。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**——不得使用 1.13.0+ API(如 `ConfirmationModal`)。
- **字号改 em 相对体系**(跟随主题 `--font-text-size`),不用固定 px;靠字重 + 颜色拉层次。
- **状态色固定值**(fallback,深浅色都可读):已确认 `#1e9e4a` / bg `#e3f7e8`;待定 `#b26a00` / bg `#fff2dd`;已取消 `#98a0ad` / bg `#f0f0f2`;未设置 `var(--text-muted)` / bg `transparent`。中文标签:confirmed→已确认、tentative→待定、cancelled→已取消。
- **分类色 10 色板**(顺序固定):`["#4c8dff","#ff9500","#06b6d4","#34c759","#a855f7","#ef4444","#ec4899","#eab308","#14b8a6","#6366f1"]`;按分类名**稳定 hash → 索引**;同名同色;空分类用中性灰 `#98a0ad`。
- **中文日期格式 b**:`2026年7月19日 星期日`。英文环境本轮不处理(只保证中文正确)。
- **测试命令**:`node node_modules/vitest/vitest.mjs run <path>`(勿用 `npx vitest`)。**构建**:`npm run build`。
- **提交信息末尾**必须是:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 视图渲染函数的 `colors` 参数一律作为**可选尾参**,默认 `createColorResolver({})`,以保持既有测试零改动。

---

### Task 1: 配色模块 colors.ts(纯函数)

**Files:**
- Create: `src/agenda-panel/colors.ts`
- Test: `tests/agenda-panel/colors.test.ts`

**Interfaces:**
- Consumes: 无(零依赖纯模块)。
- Produces:
  - `interface StatusStyle { label: string; text: string; bg: string; }`
  - `interface ColorResolver { status(raw: string | undefined): StatusStyle; category(name: string | undefined): string; categoryPillBg(name: string | undefined): string; }`
  - `const CATEGORY_PALETTE: string[]`(10 色)
  - `function statusStyle(raw: string | undefined): StatusStyle`
  - `function categoryColorFor(name: string, overrides: Record<string, string>): string`
  - `function hexToRgba(hex: string, alpha: number): string`
  - `function createColorResolver(overrides?: Record<string, string>): ColorResolver`

- [ ] **Step 1: 写失败测试**

创建 `tests/agenda-panel/colors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  statusStyle,
  categoryColorFor,
  hexToRgba,
  createColorResolver,
  CATEGORY_PALETTE,
} from "../../src/agenda-panel/colors";

describe("statusStyle", () => {
  it("maps the three known statuses to Chinese labels + fixed colors", () => {
    expect(statusStyle("confirmed")).toEqual({ label: "已确认", text: "#1e9e4a", bg: "#e3f7e8" });
    expect(statusStyle("tentative").label).toBe("待定");
    expect(statusStyle("tentative").text).toBe("#b26a00");
    expect(statusStyle("cancelled").label).toBe("已取消");
  });
  it("maps empty/undefined to 未设置 with a transparent pill", () => {
    expect(statusStyle("").label).toBe("未设置");
    expect(statusStyle(undefined).label).toBe("未设置");
    expect(statusStyle("").bg).toBe("transparent");
  });
  it("keeps an unknown non-empty status visible under its own name", () => {
    expect(statusStyle("NEEDS-ACTION").label).toBe("NEEDS-ACTION");
  });
});

describe("categoryColorFor", () => {
  it("is deterministic — same name always yields the same palette color", () => {
    expect(categoryColorFor("工作", {})).toBe(categoryColorFor("工作", {}));
    expect(CATEGORY_PALETTE).toContain(categoryColorFor("工作", {}));
  });
  it("maps different names to palette entries (indices within bounds)", () => {
    for (const name of ["工作", "生活", "学习", "团队", "商务", "健康"]) {
      expect(CATEGORY_PALETTE).toContain(categoryColorFor(name, {}));
    }
  });
  it("returns a neutral gray for an empty category", () => {
    expect(categoryColorFor("", {})).toBe("#98a0ad");
  });
  it("lets a valid hex override win over the auto color", () => {
    expect(categoryColorFor("工作", { 工作: "#123456" })).toBe("#123456");
  });
  it("ignores a malformed override and falls back to the palette", () => {
    expect(categoryColorFor("工作", { 工作: "blue" })).toBe(categoryColorFor("工作", {}));
  });
});

describe("hexToRgba", () => {
  it("expands a 6-digit hex to rgba", () => {
    expect(hexToRgba("#4c8dff", 0.15)).toBe("rgba(76, 141, 255, 0.15)");
  });
  it("returns the input unchanged when it is not a 6-digit hex", () => {
    expect(hexToRgba("var(--x)", 0.15)).toBe("var(--x)");
  });
});

describe("createColorResolver", () => {
  it("resolves category color + pill bg, honoring overrides", () => {
    const r = createColorResolver({ 工作: "#4c8dff" });
    expect(r.category("工作")).toBe("#4c8dff");
    expect(r.categoryPillBg("工作")).toBe("rgba(76, 141, 255, 0.15)");
  });
  it("resolves status through the same object", () => {
    expect(createColorResolver().status("confirmed").label).toBe("已确认");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/colors.test.ts`
Expected: FAIL(`Cannot find module '../../src/agenda-panel/colors'`)。

- [ ] **Step 3: 实现 colors.ts**

创建 `src/agenda-panel/colors.ts`:

```ts
export interface StatusStyle {
  label: string;
  text: string;
  bg: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  confirmed: { label: "已确认", text: "#1e9e4a", bg: "#e3f7e8" },
  tentative: { label: "待定", text: "#b26a00", bg: "#fff2dd" },
  cancelled: { label: "已取消", text: "#98a0ad", bg: "#f0f0f2" },
};

const UNSET_STATUS: StatusStyle = { label: "未设置", text: "var(--text-muted)", bg: "transparent" };

export function statusStyle(raw: string | undefined): StatusStyle {
  const key = (raw ?? "").trim();
  if (key === "") return UNSET_STATUS;
  if (STATUS_STYLES[key]) return STATUS_STYLES[key];
  // Unknown non-empty status: keep it visible under its own name, neutral colors.
  return { label: key, text: "var(--text-muted)", bg: "transparent" };
}

export const CATEGORY_PALETTE = [
  "#4c8dff",
  "#ff9500",
  "#06b6d4",
  "#34c759",
  "#a855f7",
  "#ef4444",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#6366f1",
];

const NEUTRAL_CATEGORY = "#98a0ad";

/** FNV-1a 32-bit hash → palette index. Deterministic: the same name always maps to the same color. */
function paletteIndex(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % CATEGORY_PALETTE.length;
}

function isHex6(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

export function categoryColorFor(name: string, overrides: Record<string, string>): string {
  const key = name.trim();
  if (key === "") return NEUTRAL_CATEGORY;
  const ov = overrides[key];
  if (ov && isHex6(ov)) return ov;
  return CATEGORY_PALETTE[paletteIndex(key)];
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ColorResolver {
  status(raw: string | undefined): StatusStyle;
  category(name: string | undefined): string;
  categoryPillBg(name: string | undefined): string;
}

export function createColorResolver(overrides: Record<string, string> = {}): ColorResolver {
  return {
    status: (raw) => statusStyle(raw),
    category: (name) => categoryColorFor(name ?? "", overrides),
    categoryPillBg: (name) => hexToRgba(categoryColorFor(name ?? "", overrides), 0.15),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/colors.test.ts`
Expected: PASS(全部用例)。

- [ ] **Step 5: 提交**

```bash
git add src/agenda-panel/colors.ts tests/agenda-panel/colors.test.ts
git commit -m "feat(v3ui): color module — fixed status colors + hashed category palette + resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 中文日期模块 date-format.ts(纯函数)

**Files:**
- Create: `src/agenda-panel/date-format.ts`
- Test: `tests/agenda-panel/date-format.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `function formatChineseDate(d: Date): string` —— 形如 `2026年7月19日 星期日`
  - `function formatChineseMonth(d: Date): string` —— 形如 `2026年7月`

- [ ] **Step 1: 写失败测试**

创建 `tests/agenda-panel/date-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatChineseDate, formatChineseMonth } from "../../src/agenda-panel/date-format";

describe("formatChineseDate", () => {
  it("formats a date as 2026年7月19日 星期日", () => {
    expect(formatChineseDate(new Date(2026, 6, 19))).toBe("2026年7月19日 星期日");
  });
  it("uses the correct weekday name for a weekday", () => {
    expect(formatChineseDate(new Date(2026, 6, 17))).toBe("2026年7月17日 星期五");
  });
  it("handles single-digit month and day without padding", () => {
    expect(formatChineseDate(new Date(2026, 0, 3))).toBe("2026年1月3日 星期六");
  });
});

describe("formatChineseMonth", () => {
  it("formats a month as 2026年7月", () => {
    expect(formatChineseMonth(new Date(2026, 6, 1))).toBe("2026年7月");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/date-format.test.ts`
Expected: FAIL(找不到模块)。

- [ ] **Step 3: 实现 date-format.ts**

创建 `src/agenda-panel/date-format.ts`(手写组合,避免 Node ICU 差异导致格式/空格不稳定):

```ts
const WEEKDAYS_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/** Spec date format b, e.g. "2026年7月19日 星期日". */
export function formatChineseDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_ZH[d.getDay()]}`;
}

/** e.g. "2026年7月". */
export function formatChineseMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/date-format.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/agenda-panel/date-format.ts tests/agenda-panel/date-format.test.ts
git commit -m "feat(v3ui): Chinese date formatting (format b: 2026年7月19日 星期日)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: styles.css 视觉体系重写(em + A 风格 + 分段 Tab + 仪表盘 + 多月迷你日历)

**Files:**
- Modify(整体替换): `styles.css`

**Interfaces:**
- Consumes: 无(纯 CSS)。
- Produces: 供计划一/二/三所有视图使用的类。**一次性覆盖全部**:面板/分段 Tab、事件行(色条 + 状态/分类 pill)、日卡片、周/月格子、统计仪表盘、多月迷你日历、表单。后续任务只引用这些类,不再改 CSS。

> 说明:CSS 单独成任务,验证靠 `npm run build` 通过 + 既有测试仍全绿(CSS 改动不影响 TS 单测,但视图任务尚未套用新结构时,类多余无害)。分类色/状态色的**具体色值**由 JS 通过 `element.style` 动态设置(见 Task 4/5),CSS 只管结构与主题变量。

- [ ] **Step 1: 整体替换 styles.css**

将 `styles.css` 全量替换为:

```css
/* ogenda — Agenda panel styles (v3-UI: em-relative "activity-informational" style) */

.ogenda-panel {
  padding: 0.5em 1em 1em;
  font-size: var(--font-text-size, 16px);
}

.ogenda-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75em;
  flex-wrap: wrap;
  padding: 0.5em 0 0.75em;
  border-bottom: 1px solid var(--background-modifier-border);
  margin-bottom: 1em;
}

/* Segmented tab control (iOS-style) */
.ogenda-panel-tabs {
  display: inline-flex;
  background: var(--background-modifier-hover);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.ogenda-panel-tab {
  padding: 0.35em 0.9em;
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.9em;
  color: var(--text-muted);
  white-space: nowrap;
}
.ogenda-panel-tab:hover {
  color: var(--text-normal);
}
.ogenda-panel-tab.active {
  background: var(--background-primary);
  color: var(--text-normal);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.ogenda-panel-nav {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font-size: 0.9em;
  color: var(--text-normal);
}
.ogenda-navbtn {
  cursor: pointer;
  padding: 0.15em 0.5em;
  border-radius: 4px;
  color: var(--text-muted);
}
.ogenda-navbtn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.ogenda-navtoday {
  cursor: pointer;
}

.ogenda-panel-newbtn {
  cursor: pointer;
  padding: 0.35em 0.8em;
  border-radius: 7px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  font-size: 0.8em;
  font-weight: 600;
}

/* ---------- List view (A style) ---------- */
.ogenda-list-statusgroup {
  margin-bottom: 1.1em;
}
.ogenda-list-statusheader {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
  padding: 0.35em 0;
  color: var(--text-muted);
}
.ogenda-list-statusitems.collapsed {
  display: none;
}

.ogenda-event-row {
  display: flex;
  align-items: center;
  gap: 0.75em;
  padding: 0.65em 0.9em;
  border-left: 4px solid var(--interactive-accent);
  border-radius: 8px;
  background: var(--background-secondary);
  margin-bottom: 0.5em;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.ogenda-event-row:hover {
  background: var(--background-modifier-hover);
}
.ogenda-event-time {
  min-width: 5.4em;
  font-size: 0.8em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.ogenda-event-main {
  flex: 1;
  min-width: 0;
}
.ogenda-event-title {
  font-size: 1.05em;
  font-weight: 700;
  color: var(--text-normal);
}
.ogenda-event-loc {
  font-size: 0.8em;
  color: var(--text-faint);
  margin-top: 0.15em;
}

.ogenda-status-pill,
.ogenda-cat-pill {
  font-size: 0.72em;
  padding: 0.15em 0.65em;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ogenda-status-pill {
  font-weight: 600;
}

/* ---------- Day view ---------- */
.ogenda-day-layout {
  display: flex;
  gap: 1em;
}
.ogenda-day-main {
  flex: 1;
  min-width: 0;
}
.ogenda-day-side {
  width: 230px;
  flex-shrink: 0;
}

.ogenda-day-card {
  border-radius: 10px;
  background: var(--background-secondary);
  border-left: 4px solid var(--interactive-accent);
  padding: 0.9em 1em;
  margin-bottom: 0.9em;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.ogenda-day-card:hover {
  background: var(--background-modifier-hover);
}
.ogenda-day-time {
  font-size: 0.85em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  margin-bottom: 0.25em;
}
.ogenda-day-titlerow {
  display: flex;
  align-items: center;
  gap: 0.6em;
  margin-bottom: 0.6em;
}
.ogenda-day-title {
  font-size: 1.15em;
  font-weight: 700;
}
.ogenda-field-grid {
  display: grid;
  grid-template-columns: 5.5em 1fr;
  row-gap: 0.4em;
  column-gap: 0.7em;
  font-size: 0.85em;
}
.ogenda-field-row {
  display: contents;
}
.ogenda-field-key {
  color: var(--text-muted);
}
.ogenda-field-value {
  color: var(--text-normal);
}

/* ---------- Week view ---------- */
.ogenda-week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5em;
}
.ogenda-week-col-head {
  text-align: center;
  font-size: 0.72em;
  color: var(--text-muted);
  padding-bottom: 0.4em;
}
.ogenda-week-col {
  min-height: 14em;
  background: var(--background-secondary);
  border-radius: 6px;
  padding: 0.4em;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.ogenda-week-card {
  border-radius: 6px;
  background: var(--background-primary);
  border-left: 3px solid var(--interactive-accent);
  padding: 0.4em 0.5em;
  cursor: pointer;
}
.ogenda-week-card:hover {
  background: var(--background-modifier-hover);
}
.ogenda-week-card-time {
  font-size: 0.68em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.ogenda-week-card-title {
  font-size: 0.8em;
  font-weight: 600;
  margin: 0.15em 0;
  line-height: 1.25;
}
.ogenda-week-card-loc {
  font-size: 0.68em;
  color: var(--text-muted);
}

/* ---------- Month view ---------- */
.ogenda-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4em;
}
.ogenda-month-dow {
  text-align: center;
  font-size: 0.72em;
  color: var(--text-muted);
  padding-bottom: 0.25em;
}
.ogenda-month-cell {
  min-height: 5em;
  border-radius: 6px;
  background: var(--background-secondary);
  padding: 0.35em;
}
.ogenda-month-othermonth {
  opacity: 0.4;
}
.ogenda-month-daynum {
  font-size: 0.75em;
  color: var(--text-muted);
  margin-bottom: 0.2em;
}
.ogenda-month-mini {
  font-size: 0.68em;
  background: var(--background-modifier-hover);
  border-left: 3px solid var(--interactive-accent);
  color: var(--text-normal);
  border-radius: 3px;
  padding: 0.05em 0.3em;
  margin-top: 0.15em;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ogenda-month-mini:hover {
  background: var(--background-modifier-active-hover);
}

/* ---------- Mini calendar (multi-month) ---------- */
.ogenda-mini-cal-month {
  margin-bottom: 1em;
}
.ogenda-mini-cal-header {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  margin-bottom: 0.4em;
}
.ogenda-mini-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.ogenda-mini-cal-dow {
  text-align: center;
  font-size: 0.65em;
  color: var(--text-muted);
}
.ogenda-mini-cal-cell {
  position: relative;
  text-align: center;
  font-size: 0.72em;
  padding: 0.3em 0;
  border-radius: 4px;
  cursor: pointer;
}
.ogenda-mini-cal-cell:hover {
  background: var(--background-modifier-hover);
}
.ogenda-mini-cal-othermonth {
  opacity: 0.35;
}
.ogenda-mini-cal-selected {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.ogenda-mini-cal-dot {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--interactive-accent);
}
.ogenda-mini-cal-selected .ogenda-mini-cal-dot {
  background: var(--text-on-accent);
}

/* ---------- Stats dashboard ---------- */
.ogenda-stat-kpis {
  display: flex;
  gap: 0.6em;
  margin-bottom: 0.9em;
}
.ogenda-kpi {
  flex: 1;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 0.8em;
}
.ogenda-kpi-num {
  font-size: 1.7em;
  font-weight: 800;
  line-height: 1;
}
.ogenda-kpi-label {
  font-size: 0.72em;
  color: var(--text-muted);
  margin-top: 0.35em;
}
.ogenda-kpi-warn {
  border-color: var(--text-error);
}
.ogenda-stat-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 0.9em;
  margin-bottom: 0.8em;
}
.ogenda-stat-card-title {
  font-size: 0.8em;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.7em;
}
.ogenda-stat-bar-row {
  display: flex;
  align-items: center;
  gap: 0.6em;
  margin-bottom: 0.5em;
}
.ogenda-stat-bar-label {
  width: 4em;
  font-size: 0.75em;
  font-weight: 600;
}
.ogenda-stat-bar-track {
  flex: 1;
  background: var(--background-modifier-border);
  border-radius: 6px;
  height: 0.55em;
  overflow: hidden;
}
.ogenda-stat-bar-fill {
  height: 100%;
  border-radius: 6px;
}
.ogenda-stat-bar-count {
  width: 1.6em;
  text-align: right;
  font-size: 0.75em;
  color: var(--text-muted);
}
.ogenda-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
.ogenda-cat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 0.4em 0.7em;
  font-size: 0.75em;
}
.ogenda-cat-chip-bar {
  width: 4px;
  height: 1em;
  border-radius: 2px;
}
.ogenda-cat-chip-count {
  color: var(--text-muted);
}
.ogenda-stat-minis {
  display: flex;
  gap: 0.6em;
}
.ogenda-stat-mini {
  flex: 1;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 0.7em 0.8em;
}
.ogenda-stat-mini-label {
  font-size: 0.72em;
  color: var(--text-muted);
  margin-bottom: 0.3em;
}
.ogenda-stat-mini-val {
  font-size: 0.95em;
  font-weight: 700;
}

/* ---------- Event form modal ---------- */
.ogenda-form-error {
  color: var(--text-error);
  font-size: 0.8em;
  min-height: 1em;
}
.ogenda-form-buttons {
  display: flex;
  gap: 0.5em;
  justify-content: flex-end;
  margin-top: 0.8em;
}
.ogenda-form-datetime {
  width: 100%;
}
```

- [ ] **Step 2: 构建确认通过**

Run: `npm run build`
Expected: `tsc` 无报错 + esbuild 产出 `main.js`(无错误)。

- [ ] **Step 3: 跑全量测试确认无回归**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿(CSS 改动不影响 TS 单测)。

- [ ] **Step 4: 提交**

```bash
git add styles.css
git commit -m "style(v3ui): em-relative visual system — A-style cards, pills, segmented tabs, stats dashboard, multi-month mini-cal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 清单视图 A 风格(5 类信息 + 色条 + 状态/分类 pill + 中文状态标签)

**Files:**
- Modify: `src/agenda-panel/views/list-view.ts`
- Modify(测试期望): `tests/agenda-panel/views/list-view.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `ColorResolver`、`createColorResolver`、`statusStyle`(Task 1);`EventOccurrence`(既有)。
- Produces: `renderListView(container, occurrences, onEventClick, colors?)` —— 每行:时间 | 标题(粗)+ 地点(次要行) | 状态 pill | 分类 pill,左边框着分类色;按状态分组、可折叠,分组头显示中文状态标签 + 计数(`已确认 · 3`)。

> 关键取舍:状态**中文标签**是设计核心,与颜色无关,故 `list-view` 直接引用纯函数 `statusStyle().label`——因此既有测试里 `confirmed`/`tentative` 的分组头断言必须改为 `已确认`/`待定`(Step 1)。颜色样式走可选 `colors` 尾参,旧测试不传时用默认 resolver,不影响断言。

- [ ] **Step 1: 改测试(改 3 处旧断言 + 加 2 个新用例)**

在 `tests/agenda-panel/views/list-view.test.ts`:

① 顶部 import 增加 resolver:

```ts
import { renderListView } from "../../../src/agenda-panel/views/list-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
```

② 把"groups occurrences by status"用例里的三处断言(原 `confirmed`/`tentative`/`未设置`)改为中文标签:

```ts
    const headers = container.querySelectorAll(".ogenda-list-statusheader");
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain("已确认");
    expect(headers[1].textContent).toContain("待定");
    expect(headers[2].textContent).toContain("未设置");
```

③ 在 `describe` 末尾追加两个新用例:

```ts
  it("puts a status pill and a category pill on a row, and colors the left bar from the category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "评审", start: "2026-07-18T14:00:00", status: "confirmed", category: "工作", origin: "synced" },
      start: "2026-07-18T14:00:00",
    };
    renderListView(container, [occ], () => {}, createColorResolver({}));
    const row = container.querySelector(".ogenda-event-row") as HTMLElement;
    expect(container.querySelector(".ogenda-status-pill")?.textContent).toBe("已确认");
    expect(container.querySelector(".ogenda-cat-pill")?.textContent).toBe("工作");
    expect(row.style.borderLeftColor).not.toBe("");
  });

  it("omits the status pill for an unset-status event", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "无状态", start: "2026-07-18T14:00:00", origin: "synced" },
      start: "2026-07-18T14:00:00",
    };
    renderListView(container, [occ], () => {}, createColorResolver({}));
    expect(container.querySelector(".ogenda-status-pill")).toBeNull();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/list-view.test.ts`
Expected: FAIL(旧断言现值仍是 `confirmed`;新用例找不到 `.ogenda-status-pill`/`.ogenda-cat-pill`)。

- [ ] **Step 3: 重写 list-view.ts**

整体替换 `src/agenda-panel/views/list-view.ts`:

```ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";

const STATUS_ORDER = ["confirmed", "tentative", "cancelled"];

interface StatusGroup {
  key: string;
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
  return orderedKeys.map((key) => ({ key, items: buckets.get(key)! }));
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
  colors: ColorResolver = createColorResolver({}),
): void {
  container.innerHTML = "";
  for (const group of groupByStatus(occurrences)) {
    const st = statusStyle(group.key);
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-statusgroup";

    const header = document.createElement("div");
    header.className = "ogenda-list-statusheader";
    header.textContent = `${st.label} · ${group.items.length}`;

    const itemsEl = document.createElement("div");
    itemsEl.className = "ogenda-list-statusitems";
    header.addEventListener("click", () => itemsEl.classList.toggle("collapsed"));
    groupEl.appendChild(header);

    for (const occ of group.items) {
      const ev = occ.event;
      const row = document.createElement("div");
      row.className = "ogenda-event-row";
      row.style.borderLeftColor = colors.category(ev.category);
      row.addEventListener("click", () => onEventClick(ev));

      const time = document.createElement("span");
      time.className = "ogenda-event-time";
      time.textContent = formatTime(occ);
      row.appendChild(time);

      const main = document.createElement("div");
      main.className = "ogenda-event-main";
      const title = document.createElement("div");
      title.className = "ogenda-event-title";
      title.textContent = ev.title;
      main.appendChild(title);
      if (ev.location) {
        const loc = document.createElement("div");
        loc.className = "ogenda-event-loc";
        loc.textContent = ev.location;
        main.appendChild(loc);
      }
      row.appendChild(main);

      if ((ev.status ?? "").trim() !== "") {
        const pill = document.createElement("span");
        pill.className = "ogenda-status-pill";
        pill.textContent = st.label;
        pill.style.color = st.text;
        pill.style.background = st.bg;
        row.appendChild(pill);
      }
      if (ev.category) {
        const cat = document.createElement("span");
        cat.className = "ogenda-cat-pill";
        cat.textContent = ev.category;
        cat.style.color = colors.category(ev.category);
        cat.style.background = colors.categoryPillBg(ev.category);
        row.appendChild(cat);
      }

      itemsEl.appendChild(row);
    }
    groupEl.appendChild(itemsEl);
    container.appendChild(groupEl);
  }
}
```

- [ ] **Step 4: 接线面板(建 resolver + 传给清单)**

在 `src/agenda-panel/agenda-panel-view.ts`:

① import 增加(与既有 import 同区):

```ts
import { createColorResolver } from "./colors";
```

② 在 `render()` 里,`const events: AgendaEvent[] = local.map(localToEvent);` 之后加一行:

```ts
      const colors = createColorResolver({});
```

③ 把清单渲染调用改为传 `colors`:

```ts
        if (this.tab === "list") renderListView(body, occurrences, onEventClick, colors);
```

- [ ] **Step 5: 跑测试 + 构建确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/list-view.test.ts`
Expected: PASS。
Run: `npm run build`
Expected: 无 TS 报错(`colors` 已在 `render()` 内声明并使用)。

- [ ] **Step 6: 提交**

```bash
git add src/agenda-panel/views/list-view.ts tests/agenda-panel/views/list-view.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): list view A-style — color bar + status/category pills + Chinese status labels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 日视图重塑(分类色条 + 状态 pill + 大标题)

**Files:**
- Modify: `src/agenda-panel/views/day-view.ts`
- Modify(测试期望): `tests/agenda-panel/views/day-view.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `ColorResolver`、`createColorResolver`、`statusStyle`(Task 1)。
- Produces: `renderDayView(container, occurrences, onEventClick, colors?)` —— 卡片左边框着分类色;标题行右侧放中文状态 pill;字段网格去掉"状态"行(改由 pill 表达),保留地点/组织者/参与人/RSVP/分类/标签/重复规则。

- [ ] **Step 1: 改测试(1 处旧断言 + 1 个新用例)**

在 `tests/agenda-panel/views/day-view.test.ts`:

① 顶部 import 增加:

```ts
import { renderDayView } from "../../../src/agenda-panel/views/day-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
```

② 第一个用例里,把 `expect(container.textContent).toContain("confirmed");` 改为中文标签:

```ts
    expect(container.textContent).toContain("已确认");
```

③ 追加新用例(色条 + 状态 pill):

```ts
  it("colors the card's left bar from the category and shows a status pill", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "评审会", start: "2026-07-16T14:00:00", status: "confirmed", category: "工作", origin: "synced",
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {}, createColorResolver({}));
    const card = container.querySelector(".ogenda-day-card") as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe("");
    expect(container.querySelector(".ogenda-status-pill")?.textContent).toBe("已确认");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/day-view.test.ts`
Expected: FAIL(旧断言现值仍是 `confirmed`;新用例找不到 `.ogenda-status-pill`)。

- [ ] **Step 3: 重写 day-view.ts**

整体替换 `src/agenda-panel/views/day-view.ts`:

```ts
import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";

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
  colors: ColorResolver = createColorResolver({}),
): void {
  container.innerHTML = "";
  for (const occ of occurrences) {
    const ev = occ.event;
    const card = document.createElement("div");
    card.className = "ogenda-day-card";
    card.style.borderLeftColor = colors.category(ev.category);
    card.addEventListener("click", () => onEventClick(ev));

    const time = document.createElement("div");
    time.className = "ogenda-day-time";
    time.textContent = formatTime(occ);
    card.appendChild(time);

    const titleRow = document.createElement("div");
    titleRow.className = "ogenda-day-titlerow";
    const title = document.createElement("div");
    title.className = "ogenda-day-title";
    title.textContent = ev.title;
    titleRow.appendChild(title);
    if ((ev.status ?? "").trim() !== "") {
      const st = statusStyle(ev.status);
      const pill = document.createElement("span");
      pill.className = "ogenda-status-pill";
      pill.textContent = st.label;
      pill.style.color = st.text;
      pill.style.background = st.bg;
      titleRow.appendChild(pill);
    }
    card.appendChild(titleRow);

    const grid = document.createElement("div");
    grid.className = "ogenda-field-grid";
    addField(grid, "地点", ev.location);
    addField(grid, "组织者", ev.organizer);
    addField(grid, "参与人", ev.attendees?.length ? ev.attendees.join("、") : undefined);
    addField(grid, "RSVP", ev.rsvp);
    addField(grid, "分类", ev.category);
    addField(grid, "标签", ev.tags?.length ? ev.tags.join("、") : undefined);
    addField(grid, "重复规则", ev.rrule);
    card.appendChild(grid);

    container.appendChild(card);
  }
}
```

- [ ] **Step 4: 接线面板(传 colors 给日视图)**

在 `src/agenda-panel/agenda-panel-view.ts` 的 `render()` 里,把日视图渲染调用改为传 `colors`(该变量已在 Task 4 声明):

```ts
          renderDayView(dayMain, occurrences, onEventClick, colors);
```

- [ ] **Step 5: 跑测试 + 构建确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/views/day-view.test.ts`
Expected: PASS。
Run: `npm run build`
Expected: 无报错。

- [ ] **Step 6: 提交**

```bash
git add src/agenda-panel/views/day-view.ts tests/agenda-panel/views/day-view.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): day view — category color bar + status pill, status moved out of field grid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 导航条中文日期(#50)+ 整合构建

**Files:**
- Modify: `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `formatChineseDate`(Task 2)。
- Produces: 导航条锚点/今天按钮显示 `2026年7月19日 星期日`(替换 `toDateString()`)。

> 此任务无独立单测(导航条在 `ItemView` 内,不做单元测试);验证靠 `npm run build` 通过 + 全量测试绿 + 真机目测(见 Step 4)。`toDateString()` 是需要修的唯一英文日期来源;迷你日历月标题已是中文(`${year}年${month}月`),计划二会统一改用 `formatChineseMonth`。

- [ ] **Step 1: 引 import**

在 `src/agenda-panel/agenda-panel-view.ts` 顶部 import 区加:

```ts
import { formatChineseDate } from "./date-format";
```

- [ ] **Step 2: 替换导航条日期文本**

在 `render()` 的导航条段落,把 `todayBtn` 的 `text` 由 `this.anchor.toDateString()` 改为中文格式:

原:
```ts
    const todayBtn = nav.createSpan({
      cls: "ogenda-navbtn ogenda-navtoday",
      text: isToday ? `今天 · ${this.anchor.toDateString()}` : this.anchor.toDateString(),
    });
```
改为:
```ts
    const todayBtn = nav.createSpan({
      cls: "ogenda-navbtn ogenda-navtoday",
      text: isToday ? `今天 · ${formatChineseDate(this.anchor)}` : formatChineseDate(this.anchor),
    });
```

- [ ] **Step 3: 构建 + 全量测试**

Run: `npm run build`
Expected: 无报错。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿。

- [ ] **Step 4: 真机目测(手动验收清单)**

在真机 Obsidian(1.12.7)重载插件后确认:
- Tab 是分段控件(浅底容器 + 选中项白底浮起)。
- 导航条锚点日期显示中文(如 `今天 · 2026年7月19日 星期日`)。
- 清单视图:每行有左侧分类色条、彩色状态 pill(已确认/待定…)、分类 pill;分组头是 `已确认 · N`。
- 日视图:卡片左色条 + 标题右侧状态 pill;字号明显比旧版大且有层次。

- [ ] **Step 5: 提交**

```bash
git add src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): Chinese anchor date in nav bar (#50, format b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review(计划一)

- **Spec 覆盖**:视觉体系(§1.1–1.3)→ Task 3;分段 Tab(§1.4)→ Task 3;配色(§1.2)→ Task 1;清单 A 风格(§2)→ Task 4;日视图(§2)→ Task 5;中文日期(§3)→ Task 2 + Task 6。本计划**不含**:周/月/统计视图、多月迷你日历(→ 计划二)、表单/设置(→ 计划三)。
- **占位扫描**:无 TBD/TODO;每个代码步都给了完整代码。
- **类型一致**:`ColorResolver`/`createColorResolver`/`statusStyle` 在 Task 1 定义,Task 4/5 按同签名消费;视图 `colors` 均为可选尾参默认 `createColorResolver({})`。
- **测试命令**:统一 `node node_modules/vitest/vitest.mjs run`。
