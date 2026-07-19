# Ogenda v4 计划二:全量中英 i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给插件加**中/英全量国际化**:一个轻量 `t(key)` 词表体系、设置里的语言下拉(跟随 Obsidian/简中/English)、按语言格式化日期,并把现有 ~88 处中文硬串全部抽成 `t("…")` + 英文词表。

**Architecture:** 新增 `src/i18n/`(纯 `t()` + 当前语言状态 + `setLanguage`;`zh.ts`/`en.ts` 词表键集必须一致)。`resolveLanguage(setting, obsidianLocale)` 纯函数决定实际语言。`main.ts` 在建面板/设置前 `setLanguage(...)`;设置里改语言 → 重渲染。状态标签(`colors.statusStyle`)、日期(`date-format`)按语言产出;`stats.ts` 的分组哨兵键改为**稳定非展示常量**(不随语言变),展示时才 `t()`。视图/表单/设置/通知/命令逐区抽串。

**Tech Stack:** TypeScript、Obsidian API、vitest + jsdom、esbuild。

**依赖:** 必须在 **v4 计划一(清理更名)之后**(Gmail/分类颜色串已移除,不在抽取范围)。本计划之后是**计划三(单选同步框架)**,其新增设置 UI 串直接走本计划的 `t()`。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**。
- **语言仅中/英**;`t()` 缺键回退英文词表、再回退键名本身;`zh`/`en` 词表**键集必须完全一致**(有测试守护)。
- **不翻译**:产品名 "Ogenda"、状态机器值(`confirmed`/`tentative`/`cancelled`)、用户数据(分类名/标签/事件字段值)。
- **不改行为**:纯抽串 + 语言分派;`stats.ts` 分组统计口径不变(只把哨兵键从中文改成稳定常量,展示层再翻译)。
- **测试命令** `node node_modules/vitest/vitest.mjs run <path>`(勿用 npx);构建 `npm run build`;提交尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **⚠️ 测试类型陷阱**:`tsc` build 只检 `src/` 不检 `tests/`,vitest 用 esbuild 转译不做类型检查——**测试文件里的类型错误不会让 build/测试挂**。每个任务改完必须 `git grep` 核对无残留中文串 + 手工确认测试调用签名正确。

---

### Task 1: i18n 核心模块

**Files:**
- Create: `src/i18n/index.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`
- Test: `tests/i18n/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Lang = "zh" | "en"`
  - `function resolveLanguage(setting: "auto" | Lang, obsidianLocale: string): Lang`
  - `function setLanguage(lang: Lang): void`
  - `function getLanguage(): Lang`
  - `function t(key: string, params?: Record<string, string | number>): string`
  - `const zh: Record<string, string>` / `const en: Record<string, string>`(初始只含"核心键",后续抽取任务往里加)

- [ ] **Step 1: 写失败测试**

创建 `tests/i18n/i18n.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { t, setLanguage, getLanguage, resolveLanguage } from "../../src/i18n";
import { zh } from "../../src/i18n/zh";
import { en } from "../../src/i18n/en";

describe("resolveLanguage", () => {
  it("auto follows Obsidian locale (zh* → zh, else en)", () => {
    expect(resolveLanguage("auto", "zh")).toBe("zh");
    expect(resolveLanguage("auto", "zh-TW")).toBe("zh");
    expect(resolveLanguage("auto", "en")).toBe("en");
    expect(resolveLanguage("auto", "")).toBe("en");
  });
  it("explicit setting wins over locale", () => {
    expect(resolveLanguage("zh", "en")).toBe("zh");
    expect(resolveLanguage("en", "zh")).toBe("en");
  });
});

describe("t", () => {
  beforeEach(() => setLanguage("zh"));
  it("looks up the current language table", () => {
    setLanguage("zh");
    expect(t("view.tab.list")).toBe("清单");
    setLanguage("en");
    expect(t("view.tab.list")).toBe("List");
  });
  it("interpolates {params}", () => {
    setLanguage("en");
    // uses a key that carries a param — see en.ts "notice.panelLoadError"
    expect(t("notice.panelLoadError", { msg: "boom" })).toContain("boom");
  });
  it("falls back to en then to the key itself for a missing key", () => {
    setLanguage("zh");
    expect(t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });
  it("getLanguage reflects setLanguage", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
  });
});

describe("zh/en key parity", () => {
  it("both tables have exactly the same key set", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/i18n/i18n.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 i18n 核心**

创建 `src/i18n/zh.ts`(初始核心键,后续任务补充):

```ts
export const zh: Record<string, string> = {
  "view.tab.list": "清单",
  "notice.panelLoadError": "Agenda 面板加载出错: {msg}",
};
```

创建 `src/i18n/en.ts`(键集与 zh 一致):

```ts
export const en: Record<string, string> = {
  "view.tab.list": "List",
  "notice.panelLoadError": "Failed to load the agenda panel: {msg}",
};
```

创建 `src/i18n/index.ts`:

```ts
import { zh } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";

const TABLES: Record<Lang, Record<string, string>> = { zh, en };

let currentLang: Lang = "en";

export function setLanguage(lang: Lang): void {
  currentLang = lang;
}

export function getLanguage(): Lang {
  return currentLang;
}

/** "auto" follows Obsidian's UI locale (zh* → zh, everything else → en). */
export function resolveLanguage(setting: "auto" | Lang, obsidianLocale: string): Lang {
  if (setting === "zh" || setting === "en") return setting;
  return obsidianLocale.startsWith("zh") ? "zh" : "en";
}

/** Look up current lang, fall back to en, then to the key itself; interpolate {params}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = TABLES[currentLang][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, p) => (p in params ? String(params[p]) : `{${p}}`));
}
```

创建桶文件 `src/i18n/index.ts` 已含以上;`zh`/`en` 可从各自文件 import(测试即如此)。

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/i18n/i18n.test.ts`
Expected: PASS(含 zh/en 键集一致)。

- [ ] **Step 5: 提交**

```bash
git add src/i18n tests/i18n
git commit -m "feat(v4-i18n): core t() + resolveLanguage + zh/en tables (key-parity tested)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 语言设置字段 + 下拉 + 装配

**Files:**
- Modify: `src/settings/settings.ts`(加 `language`)
- Modify: `tests/settings/settings.test.ts`(sanitize language)
- Modify: `src/settings/settings-tab.ts`(顶部语言下拉)
- Modify: `src/main.ts`(loadSettings 后 `setLanguage(resolveLanguage(...))`)

**Interfaces:**
- Consumes: `setLanguage`/`resolveLanguage`(Task 1)。
- Produces: `OgendaSettings.language: "auto" | "zh" | "en"`(默认 `"auto"`);设置顶部语言下拉;插件加载即按设置定语言;改语言即重渲染设置页 + 已开面板。

- [ ] **Step 1: settings 加 language + 测试**

在 `tests/settings/settings.test.ts` 第一个用例期望对象加 `language: "auto",`;末尾加:

```ts
  it("keeps a valid language and defaults to auto", () => {
    expect(sanitizeSettings({ language: "en" }).language).toBe("en");
    expect(sanitizeSettings({ language: "zh" }).language).toBe("zh");
    expect(sanitizeSettings({ language: "bogus" }).language).toBe("auto");
    expect(sanitizeSettings({}).language).toBe("auto");
  });
```

在 `src/settings/settings.ts`:接口加 `language: "auto" | "zh" | "en";`;DEFAULT 加 `language: "auto",`;sanitize 加(用一个白名单 helper):

```ts
  const lang = (v: unknown): "auto" | "zh" | "en" => (v === "zh" || v === "en" ? v : "auto");
```
返回对象加 `language: lang(r.language),`。

- [ ] **Step 2: 跑 settings 测试(RED→GREEN)**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`(先 RED 后实现再 GREEN)。

- [ ] **Step 3: settings-tab 顶部语言下拉**

在 `src/settings/settings-tab.ts` `display()` **最上方**(`containerEl.empty()` 之后)插入:

```ts
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("auto", t("settings.language.auto"));
        d.addOption("zh", "简体中文");
        d.addOption("en", "English");
        d.setValue(this.plugin.settings.language);
        d.onChange(async (v) => {
          this.plugin.settings.language = v as "auto" | "zh" | "en";
          await this.plugin.saveSettings();
          setLanguage(resolveLanguage(this.plugin.settings.language, getObsidianLocale()));
          this.display(); // re-render settings in the new language
          this.plugin.refreshOpenPanels(); // re-render open agenda panels
        });
      });
```

顶部 import 加:`import { t, setLanguage, resolveLanguage } from "../i18n";`,并加一个本地 helper(文件底部或顶部):

```ts
export function getObsidianLocale(): string {
  return window.localStorage.getItem("language") ?? "en";
}
```

- [ ] **Step 4: main.ts 装配语言 + refreshOpenPanels**

在 `src/main.ts`:
- import 加 `import { setLanguage, resolveLanguage } from "./i18n";` 与 `import { getObsidianLocale } from "./settings/settings-tab";`
- `onload()` 里 `await this.loadSettings();` 之后立刻:`setLanguage(resolveLanguage(this.settings.language, getObsidianLocale()));`
- 加公有方法:

```ts
  refreshOpenPanels(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(AGENDA_PANEL_VIEW_TYPE)) {
      const v = leaf.view as AgendaPanelView;
      if (typeof (v as unknown as { rerender?: () => void }).rerender === "function") {
        (v as unknown as { rerender: () => void }).rerender();
      }
    }
  }
```

在 `src/agenda-panel/agenda-panel-view.ts` 加公有 `rerender()`:`rerender(): void { void this.render(); }`

- [ ] **Step 5: build + 全量**

Run: `npm run build`;`node node_modules/vitest/vitest.mjs run`。Expected: 绿。

- [ ] **Step 6: 提交**

```bash
git add src/settings/settings.ts tests/settings/settings.test.ts src/settings/settings-tab.ts src/main.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v4-i18n): language setting + dropdown (auto/zh/en) + apply on load & re-render on change

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 日期按语言格式化

**Files:**
- Modify: `src/agenda-panel/date-format.ts`
- Modify: `tests/agenda-panel/date-format.test.ts`

**Interfaces:**
- Produces:
  - `formatDate(d: Date, lang: Lang): string` —— zh `2026年7月19日 星期日`;en `Sun, Jul 19, 2026`。
  - `formatMonth(d: Date, lang: Lang): string` —— zh `2026年7月`;en `Jul 2026`。
  - 保留旧 `formatChineseDate`/`formatChineseMonth` 作为 `formatDate(d,"zh")` 的薄封装(或直接替换所有调用点为 `formatDate(d, getLanguage())`)。

- [ ] **Step 1: 写失败测试**

在 `tests/agenda-panel/date-format.test.ts` 追加(顶部 import 加 `formatDate, formatMonth`):

```ts
describe("formatDate (language-aware)", () => {
  it("zh: 2026年7月19日 星期日", () => {
    expect(formatDate(new Date(2026, 6, 19), "zh")).toBe("2026年7月19日 星期日");
  });
  it("en: Sun, Jul 19, 2026", () => {
    expect(formatDate(new Date(2026, 6, 19), "en")).toBe("Sun, Jul 19, 2026");
  });
});
describe("formatMonth (language-aware)", () => {
  it("zh 2026年7月 / en Jul 2026", () => {
    expect(formatMonth(new Date(2026, 6, 1), "zh")).toBe("2026年7月");
    expect(formatMonth(new Date(2026, 6, 1), "en")).toBe("Jul 2026");
  });
});
```

- [ ] **Step 2: 跑 RED**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/date-format.test.ts` → FAIL。

- [ ] **Step 3: 实现**

在 `src/agenda-panel/date-format.ts` 整体改为(手写组合,避免 ICU 差异):

```ts
import { Lang } from "../i18n";

const WEEKDAYS_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_ZH[d.getDay()]}`;
  }
  return `${WEEKDAYS_EN[d.getDay()]}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatMonth(d: Date, lang: Lang): string {
  if (lang === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}
```

删除旧 `formatChineseDate`/`formatChineseMonth`(或改为薄封装);更新调用点:
- `agenda-panel-view.ts` 导航条:`formatChineseDate(this.anchor)` → `formatDate(this.anchor, getLanguage())`(import `formatDate` + `getLanguage`)。
- `mini-calendar.ts` 月标题:`formatChineseMonth(monthAnchor)` → `formatMonth(monthAnchor, getLanguage())`。
- 相应旧 date-format 测试(`formatChineseDate`/`formatChineseMonth`)改成调 `formatDate(d,"zh")`/`formatMonth(d,"zh")` 或删除。

- [ ] **Step 4: GREEN + build + 全量**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/date-format.test.ts`;`npm run build`;`node node_modules/vitest/vitest.mjs run`。全绿。

- [ ] **Step 5: 提交**

```bash
git add src/agenda-panel/date-format.ts tests/agenda-panel/date-format.test.ts src/agenda-panel/agenda-panel-view.ts src/agenda-panel/mini-calendar.ts
git commit -m "feat(v4-i18n): language-aware date/month formatting (zh + en)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 状态标签 i18n + 统计哨兵键解耦

**Files:**
- Modify: `src/agenda-panel/colors.ts`(status label 走 `t()`)
- Modify: `src/agenda-panel/stats.ts`(哨兵键改稳定常量)
- Modify: `src/agenda-panel/views/stats-view.ts`(哨兵展示走 `t()`)
- Modify: `tests/agenda-panel/colors.test.ts`、`tests/agenda-panel/stats.test.ts`、`tests/agenda-panel/views/stats-view.test.ts`
- Modify: `src/i18n/zh.ts` / `en.ts`(status.* / stats.* 键)

**Interfaces:**
- `statusStyle(raw)` 的 `label` 改为 `t("status.confirmed" | "status.tentative" | "status.cancelled" | "status.unset")`(未知非空状态仍用原值)。
- `stats.ts`:`ev.status ?? "未设置"` → `ev.status ?? ""`(空串作 unset 哨兵);`ev.category ?? "未分类"` → `ev.category ?? ""`(空串作未分类哨兵)。`byStatus`/`byCategory` 用空串键。
- `stats-view.ts`:KPI/条形图/分类块里对空串键展示 `t("status.unset")`/`t("stats.uncategorized")`;固定标签("本月事件"/"状态分布"/"分类分布"/"全天 / 带时间"/"循环事件"/"最忙一天"/"未同步")走 `t("stats.*")`。

> ⚠️ **口径不变**:改哨兵键只是把中文常量换成空串,分组计数逻辑与既有测试的数值不变——但既有 stats 测试 fixture 里用 `"未设置"`/`"未分类"` 作 `byStatus`/`byCategory` 键的地方要同步改成 `""`,断言的展示文本改成走 `t()` 后的值(测试里先 `setLanguage("zh")`)。

- [ ] **Step 1: 加 status.*/stats.* 词表键**

`zh.ts` 加:`"status.confirmed":"已确认","status.tentative":"待定","status.cancelled":"已取消","status.unset":"未设置","stats.total":"本月事件","stats.confirmed":"已确认","stats.tentative":"待定","stats.unsynced":"未同步","stats.statusDist":"状态分布","stats.categoryDist":"分类分布","stats.uncategorized":"未分类","stats.allDayTimed":"全天 / 带时间","stats.recurring":"循环事件","stats.busiest":"最忙一天"`。
`en.ts` 加同键的英文(Confirmed/Tentative/Cancelled/Unset/This month/…/Uncategorized/All-day / Timed/Recurring/Busiest day 等)。

- [ ] **Step 2: 改测试(colors/stats/stats-view)到期望语言输出**

按上面 Interfaces 改三个测试文件:colors.test.ts 的 `statusStyle("confirmed").label` 期望在 `setLanguage("zh")` 下仍 `"已确认"`;stats.test.ts 的 fixture 键 `"未设置"`/`"未分类"` → `""`;stats-view.test.ts 的 mkStats fixture 同改 + 展示断言走 `t()`(测试顶部 `setLanguage("zh")`)。

- [ ] **Step 3: 跑 RED**;**Step 4: 实现**(colors.ts import `t`,label 改 `t("status.…")`;stats.ts 哨兵改空串;stats-view.ts 固定串 + 空串展示走 `t()`);**Step 5: GREEN + build + 全量**。

命令同前;全绿。

- [ ] **Step 6: 提交**

```bash
git add src/agenda-panel/colors.ts src/agenda-panel/stats.ts src/agenda-panel/views/stats-view.ts src/i18n tests/agenda-panel/colors.test.ts tests/agenda-panel/stats.test.ts tests/agenda-panel/views/stats-view.test.ts
git commit -m "feat(v4-i18n): status labels via t(); decouple stats grouping sentinels from display language

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 抽串 · 设置页(settings-tab)

**Files:** Modify `src/settings/settings-tab.ts` + `src/i18n/zh.ts`/`en.ts`。

**范围(当前中文串):** `启动 Obsidian 时自动同步一次`、`时区`、时区 desc、`跟随系统`、`iCloud CalDAV (D0 探针)`、`iCloud 邮箱 (Apple ID)`、`iCloud App 专用密码` + desc、`iCloud 日历 URL` + desc、`Storage folder`(英文,可留或 i18n)。

**键命名约定:** `settings.<区>.<字段>.<name|desc>`,如 `settings.storage.folder.name`、`settings.tz.name`/`.desc`、`settings.tz.followSystem`、`settings.icloud.section`、`settings.icloud.user.name`、`settings.icloud.appPassword.name`/`.desc`、`settings.icloud.calUrl.name`/`.desc`、`settings.sync.startup.desc`。

- [ ] **Step 1:** 把 settings-tab.ts 里每处中文 `setName/setDesc/addOption/createEl("h3",{text})` 改为 `t("settings.…")`;`Storage folder`/`Sync on startup` 等英文串也一并走 `t()`(键 `settings.storage.folder.name`、`settings.sync.startup.name` 等)。
- [ ] **Step 2:** `zh.ts`/`en.ts` 补齐这些键(zh 用原中文,en 给对应英文)。
- [ ] **Step 3:** 验证:`git grep -nP "[\x{4e00}-\x{9fff}]" -- src/settings/settings-tab.ts` 仅剩"简体中文"这一处硬串(语言下拉里的原生语言名,故意不翻译)——其余中文应全部进词表;`npm run build`;`node node_modules/vitest/vitest.mjs run tests/i18n/i18n.test.ts`(键集一致仍绿)。
- [ ] **Step 4: 提交**(message `feat(v4-i18n): extract settings-tab strings`,含 Co-Authored-By)。

---

### Task 6: 抽串 · 事件表单(event-form-modal + event-form-fields)

**Files:** Modify `src/agenda-panel/event-form-modal.ts`、`src/agenda-panel/event-form-fields.ts` + 词表。

**范围:** modal 的 `编辑事件/新建事件`、`标题/全天/开始时间/结束时间`(+desc `可留空(全天填次日,排他)`)、`地点/组织者/参与人`(+desc `多个用逗号分隔`)、`状态/(未设置)`、`RSVP`、`分类`(+desc `下拉选已有分类`)、`新分类`(+desc)、`标签`(+desc)、`在笔记中查看/删除/保存`;fields 的三条校验 `标题不能为空`、`开始时间不能为空`、`全天事件结束日期需晚于开始日期(次日为排他)`。

**键约定:** `form.title.name`、`form.allDay.name`、`form.start.name`、`form.end.name`/`.desc`、`form.location.name`、`form.attendees.name`/`.desc`、`form.status.name`、`form.status.unset`、`form.category.name`/`.desc`、`form.newCategory.name`/`.desc`、`form.tags.name`/`.desc`、`form.viewInNote`、`form.delete`、`form.save`、`form.titleNew`/`form.titleEdit`;`validate.titleRequired`、`validate.startRequired`、`validate.allDayEnd`。

- [ ] **Step 1–2:** 逐处改 `t("form.…")` / `t("validate.…")`;补词表。
- [ ] **Step 3:** 验证 `git grep -nP "[\x{4e00}-\x{9fff}]" -- src/agenda-panel/event-form-modal.ts src/agenda-panel/event-form-fields.ts` 无输出;`npm run build`;`node node_modules/vitest/vitest.mjs run tests/agenda-panel/event-form-fields.test.ts`(校验用例断言值需 `setLanguage("zh")` 或按 en 调整——见注)。
  > 注:`event-form-fields.test.ts` 断言 `validateEventForm(...).errors`/`.valid`;若断言了具体中文错误文案,在测试顶部 `setLanguage("zh")` 保持中文,或改断言为 `t("validate.…")`。`.valid` 布尔断言不受影响。
- [ ] **Step 4: 提交**。

---

### Task 7: 抽串 · 各视图(list/day/week/month/stats-view 剩余/mini-calendar)

**Files:** Modify `views/list-view.ts`、`views/day-view.ts`、`views/week-view.ts`、`views/month-view.ts`、`mini-calendar.ts` + 词表(stats-view 的固定串已在 Task 4 处理)。

**范围:** `全天`(list/day/week 三处 formatTime)、day 字段标签 `地点/组织者/参与人/分类/标签/重复规则`、week/month/mini-cal 的星期缩写数组 `一二三四五六日`(mini/month)与 `周一…周日`(week)。

**键约定:** `view.allDay`、`field.location`/`field.organizer`/`field.attendees`/`field.category`/`field.tags`/`field.rrule`、`weekday.short.0..6`(一~日)与 `weekday.medium.0..6`(周一~周日)——或用数组式键 `weekday.min`(逗号串)按 lang 取。

> 星期数组建议:词表存 `"weekday.min": "一,二,三,四,五,六,日"`(zh)/`"Mo,Tu,We,Th,Fr,Sa,Su"`(en),视图 `t("weekday.min").split(",")`;`"weekday.long"` 同理给 `周一…`/`Mon…`。避免 7 个独立键。

- [ ] **Step 1–2:** 逐视图改 `t("view.allDay")` / `t("field.…")` / `t("weekday.min").split(",")` 等;补词表。**注意**:week-view 用 `周一…周日`(long),month/mini-cal 用 `一…日`(min)。
- [ ] **Step 3:** 验证 `git grep -nP "[\x{4e00}-\x{9fff}]" -- src/agenda-panel/views/ src/agenda-panel/mini-calendar.ts` 无输出;`npm run build`;`node node_modules/vitest/vitest.mjs run`(视图测试若断言了中文星期/字段,顶部 `setLanguage("zh")` 或改断言)。
- [ ] **Step 4: 提交**。

---

### Task 8: 抽串 · 面板 + 命令 + 同步通知(agenda-panel-view / main / bidirectional / sync-service)

**Files:** Modify `agenda-panel-view.ts`、`main.ts`、`sync/bidirectional.ts`、`sync/sync-service.ts` + 词表。

**范围:**
- panel:`删除事件`、`确定删除《{title}》吗?…`、`取消`、`删除`、tab 标签 `清单/日/周/月/统计`、`今天 · `、`+ 新建`、`Agenda 面板加载出错`(后者已在 Task 1 词表)。
- main:命令名 `Sync iCloud calendar`/`Sync iCloud (two-way)`/`CalDAV discovery probe (iCloud)`/`Open Agenda panel`、ribbon tooltip、`getDisplayText()` 视图标题(→ `t("view.title")` = "Ogenda"/"Agenda")、各 Notice 中文。
- bidirectional/sync-service:同步进度/失败/完成的中文 Notice(带 `{title}`/`{status}`/计数参数)。

**键约定:** `notice.*`(带参)、`command.*`、`view.title`、`view.tab.day/week/month/stats`(list 已在 Task 1)、`panel.newEvent`、`panel.today`、`confirm.delete.title`/`.body`/`.cancel`/`.confirm`、`sync.*`。

- [ ] **Step 1–2:** 逐处改 `t(...)`(带参用 `t("sync.pushFailed", { title: ev.title, status: res.status })` 形式);补词表(注意参数占位 `{title}` 等)。tab 定义 `tabDefs` 的 `label` 改 `t("view.tab.list")` 等。命令名 `addCommand({ name: t("command.…") })`。
- [ ] **Step 3:** 验证:`git grep -nP "[\x{4e00}-\x{9fff}]" -- src/agenda-panel/agenda-panel-view.ts src/main.ts src/sync/bidirectional.ts src/sync/sync-service.ts` 无输出;`npm run build`;`node node_modules/vitest/vitest.mjs run`(bidirectional/sync 测试若断言中文 Notice 文案,顶部 `setLanguage("zh")` 或改断言为 `t()`)。
- [ ] **Step 4: 提交**。

---

### Task 9: 收口 · 全局无残留 + 键集一致 + 真机

**Files:** 无代码改动(核查为主;如有零星漏网串,补进对应词表)。

- [ ] **Step 1: 全局残留核查**

Run: `git grep -nP "[\x{4e00}-\x{9fff}]" -- 'src/**/*.ts' | grep -viE "cityZh|cityEn|WEEKDAYS_ZH|//|/\*| \* "`
Expected: 仅剩**故意不翻译**的:`i18n/zh.ts` 词表值、`date-format.ts` 的 `WEEKDAYS_ZH` 数组、`settings-tab.ts` 语言下拉的 `"简体中文"` 原生名、`timezone-options.ts` 的 `cityZh` 城市数据。其余 UI 串应全部进词表。若有漏网,补进词表 + 改调用点。

- [ ] **Step 2: 键集一致 + 全量 + build**

Run: `node node_modules/vitest/vitest.mjs run tests/i18n/i18n.test.ts`(zh/en 键集一致必须绿);`node node_modules/vitest/vitest.mjs run`(全量);`npm run build`。

- [ ] **Step 3: 真机目测(手动)**

真机:设置里语言切 English → 设置页 + 面板五视图 + 新建/编辑表单 + 命令名 + 通知 全部变英文;切回简体中文 → 全中文;"跟随 Obsidian" 时与 Obsidian 界面语言一致。日期格式随语言变(zh `2026年7月19日 星期日` / en `Sun, Jul 19, 2026`)。

- [ ] **Step 4: 提交**(若 Step 1 有补漏)。

---

## Self-Review(计划二)

- **Spec 覆盖**:i18n 架构 + 语言下拉 + 日期语言化 + 全量抽串(spec §2)→ Task 1–9。
- **占位扫描**:抽取任务(5–8)给了键命名约定 + 范围串清单 + 验证(grep 无残留 + 键集一致),未逐字列全 88 串的 before/after(机械且量大)——由实现者按约定 + 清单落地,每任务以"该区 grep 无中文 + 键集一致测试绿"验收。
- **类型一致**:`t`/`setLanguage`/`resolveLanguage`/`getLanguage`/`Lang` 贯穿;`formatDate(d,lang)`/`formatMonth(d,lang)` 与调用点一致;`statusStyle().label` 接口不变(内部走 t())。
- **陷阱防护**:每个抽取任务显式要求 `git grep` 核残留 + 键集一致测试(因 build/vitest 不检 tests 类型)。
- **依赖**:计划一之后;计划三在其后(新 UI 串直接走 `t()`)。
