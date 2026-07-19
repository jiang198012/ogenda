# Ogenda v4 计划一:清理(删邮件 + 删分类颜色设置)+ 更名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除前期失误的 Gmail 邮件功能(连接器/命令/设置/依赖)、移除分类颜色手动覆盖设置(保留视图自动派色)、把插件更名为 **Ogenda**。为后续 i18n(计划二)与单选同步框架(计划三)清场。

**Architecture:** 纯删减 + 改名,不引入新行为。删 `gmail-imap.ts` + `imapflow` 依赖 + Gmail 命令/设置字段;`syncOnStartup` 从触发 Gmail 改为触发现有 iCloud 双向同步(计划三会再泛化)。删 `categoryColors` 设置字段与设置页 UI,`createColorResolver()` 去掉 overrides 形参,面板构造去掉该参;视图按分类名自动派色不变。`manifest.name`→"Ogenda"、描述去邮件化(`id` 不变)。

**Tech Stack:** TypeScript、Obsidian API、vitest + jsdom、esbuild。

**这是 v4 三个计划中的第一个。** 计划二(全量 i18n)、计划三(单选同步框架 + ICS 源)在此之后。本计划自身即可交付:一个更干净的、无邮件残留、已更名的插件,测试绿、build 干净。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**;不碰 OAuth;明文密码只存 data.json(设置页警示),绝不入仓库。
- **`manifest.id` 保持 `"ogenda"` 不变**(改 id = Obsidian 视为新插件、丢数据)。
- **视图自动派色保留**——只删"设置里的手动覆盖",不动 `colors.ts` 的 `statusStyle`/`categoryColorFor` 派色逻辑与视图色条/pill。
- **`SyncService` 保留**(通用只读编排,计划三给 ICS 复用)——本计划不删它。
- 测试 `node node_modules/vitest/vitest.mjs run <path>`(勿用 `npx vitest`);构建 `npm run build`。
- 提交尾必须是 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: 移除 Gmail / 邮件功能

**Files:**
- Delete: `src/connectors/gmail-imap.ts`
- Modify: `src/main.ts`(删 import / `syncNow()` / "Sync now (Gmail invites)" 命令 / `syncOnStartup` 改指向)
- Modify: `src/settings/settings.ts`(删 `email` / `appPassword` / `scanCount` 字段 + sanitize)
- Modify: `src/settings/settings-tab.ts`(删 Gmail 三个 Setting)
- Modify: `package.json`(删 `imapflow` 依赖)
- Modify: `tests/settings/settings.test.ts`(期望对象去掉三字段)

**Interfaces:**
- Consumes: 无新增。
- Produces: `OgendaSettings` 不再含 `email`/`appPassword`/`scanCount`;插件无 Gmail 命令;`syncOnStartup` 触发 `caldavSyncTwoWay`。

- [ ] **Step 1: 先改 settings 测试(去掉三字段期望)**

在 `tests/settings/settings.test.ts` 第一个用例的输入对象里删掉 `email`/`appPassword`/`scanCount` 三行,并把 `expect(s).toEqual({...})` 期望对象同步删这三行。改后该用例的输入/期望应为(保留其余字段 + `categoryColors`,后者由 Task 2 处理):

```ts
    const s = sanitizeSettings({
      storageFolder: "Cal",
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      bogus: "x",
    });
    expect(s).toEqual({
      storageFolder: "Cal",
      scanCount: undefined as never, // placeholder line to delete — see note
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      timezone: "",
      categoryColors: {},
    });
    expect("bogus" in s).toBe(false);
```

> ⚠️ 上面 `scanCount: undefined as never` 这行是**要删掉的**——写在这里只为提示"别漏删 scanCount"。最终期望对象里**不含** email/appPassword/scanCount。同时把该文件里第三个用例 `sanitizeSettings({ scanCount: "50" }).scanCount` 那条(测 scanCount 的)整条删除。

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`
Expected: FAIL(`sanitizeSettings` 仍返回 email/appPassword/scanCount,`toEqual` 不匹配)。

- [ ] **Step 3: 从 settings.ts 删三字段**

在 `src/settings/settings.ts`:
- `OgendaSettings` 接口删 `email` / `appPassword`(含其上注释)/ `scanCount` 三行。
- `DEFAULT_SETTINGS` 删 `email: ""` / `appPassword: ""` / `scanCount: 50` 三行。
- `sanitizeSettings` 返回对象删 `email` / `appPassword` / `scanCount` 三行。`num` 帮助函数若因此不再被使用则一并删除(检查:删后 `num` 是否还有调用点——`scanCount` 是唯一用 `num` 的,删掉后 `num` 变无用,删 `num`)。

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`
Expected: PASS。

- [ ] **Step 5: 删 gmail-imap.ts + 改 main.ts**

删除文件 `src/connectors/gmail-imap.ts`。

在 `src/main.ts`:
- 删 import 行 `import { GmailImapConnector } from "./connectors/gmail-imap";`
- 删 "Sync now (Gmail invites)" 命令(`this.addCommand({ id: "ogenda-sync-now", ... })` 整块)。
- 删 `syncNow()` 方法整块(第 68–84 行那段)。
- `syncOnStartup` 改指向:把 `this.app.workspace.onLayoutReady(() => void this.syncNow());` 改为 `this.app.workspace.onLayoutReady(() => void this.caldavSyncTwoWay());`
- 保留 `SyncService` import(仍被 `caldavSync()` 用)。

- [ ] **Step 6: 删 settings-tab.ts 的 Gmail 三个 Setting**

在 `src/settings/settings-tab.ts` 删除这三个 `new Setting(...)` 块:`"Gmail address"`、`"Gmail App 专用密码"`、`"Scan recent messages"`(保留 `"Storage folder"`、`"Sync on startup"`、`"时区"`)。

- [ ] **Step 7: 删 imapflow 依赖**

在 `package.json` 的 `dependencies` 删 `"imapflow": "^1"` 这行(注意逗号:删后 `ical.js` 成为最后一项,不能有尾逗号)。删依赖不必 `npm install`(esbuild 打包只引用 import 到的模块;gmail-imap 已删,无引用)。

- [ ] **Step 8: 全库确认无 Gmail/imapflow 残留 + build + 全量**

Run: `git grep -niE "gmail|imapflow|GmailImap|syncNow" -- src/ | grep -v "caldav"` —— 期望**无输出**(除非在注释里;若有,清理)。
Run: `npm run build`
Expected: exit 0 无报错(尤其无"找不到 gmail-imap 模块")。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git rm src/connectors/gmail-imap.ts
git add src/main.ts src/settings/settings.ts src/settings/settings-tab.ts package.json tests/settings/settings.test.ts
git commit -m "refactor(v4): remove Gmail/email functionality (connector, command, settings, imapflow dep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 移除分类颜色手动覆盖(保留视图自动派色)

**Files:**
- Modify: `src/settings/settings.ts`(删 `categoryColors` + `strMap`)
- Modify: `src/settings/settings-tab.ts`(删 "分类颜色" 段 + `renderCategoryColors`)
- Modify: `src/agenda-panel/colors.ts`(`createColorResolver` 去 overrides;`categoryColorFor` 去 overrides 形参)
- Modify: `src/agenda-panel/agenda-panel-view.ts`(构造去 `categoryColors` 参;`createColorResolver()` 无参)
- Modify: `src/main.ts`(构造调用去 `this.settings.categoryColors` 实参)
- Modify: `tests/settings/settings.test.ts`(去 `categoryColors` 期望)
- Modify: `tests/agenda-panel/colors.test.ts`(删 override 相关用例)

**Interfaces:**
- Consumes: 无。
- Produces: `createColorResolver(): ColorResolver`(无参);`categoryColorFor(name: string): string`(无 overrides);`OgendaSettings` 不再含 `categoryColors`;`AgendaPanelView` 构造少一个参数。视图 `colors.category(name)` 接口不变。

- [ ] **Step 1: 改 colors 测试(删 override 用例)**

在 `tests/agenda-panel/colors.test.ts`:
- 删 `categoryColorFor` describe 里的两条 override 用例("lets a valid hex override win…" 与 "ignores a malformed override…")。
- 把剩余 `categoryColorFor(name, {})` 调用改为 `categoryColorFor(name)`(去掉第二个 `{}` 实参)。
- 删 `createColorResolver` describe 里 "honoring overrides" 相关断言;`createColorResolver({ 工作: "#4c8dff" })` 改为 `createColorResolver()`,并把 `r.category("工作")` 的期望从固定 `#4c8dff` 改为 `categoryColorFor("工作")`(自动派色值)。

改后 colors.test.ts 的 categoryColorFor / createColorResolver 两个 describe 参考:

```ts
describe("categoryColorFor", () => {
  it("is deterministic — same name always yields the same palette color", () => {
    expect(categoryColorFor("工作")).toBe(categoryColorFor("工作"));
    expect(CATEGORY_PALETTE).toContain(categoryColorFor("工作"));
  });
  it("maps various names into the palette", () => {
    for (const name of ["工作", "生活", "学习", "团队", "商务", "健康"]) {
      expect(CATEGORY_PALETTE).toContain(categoryColorFor(name));
    }
  });
  it("returns a neutral gray for an empty category", () => {
    expect(categoryColorFor("")).toBe("#98a0ad");
  });
});

describe("createColorResolver", () => {
  it("resolves category color + pill bg", () => {
    const r = createColorResolver();
    expect(r.category("工作")).toBe(categoryColorFor("工作"));
    expect(r.categoryPillBg("工作")).toBe(hexToRgba(categoryColorFor("工作"), 0.15));
  });
  it("resolves status through the same object", () => {
    expect(createColorResolver().status("confirmed").label).toBe("已确认");
  });
});
```

(顶部 import 保留 `hexToRgba`。)

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/colors.test.ts`
Expected: FAIL(`categoryColorFor`/`createColorResolver` 仍要 overrides 参,或 TS 参数不匹配)。

- [ ] **Step 3: 改 colors.ts 去 overrides**

在 `src/agenda-panel/colors.ts`:
- `categoryColorFor(name: string, overrides: Record<string, string>): string` → `categoryColorFor(name: string): string`;删函数体内 `const ov = overrides[key]; if (ov && isHex6(ov)) return ov;` 两行;`isHex6` 若因此无调用点则删除。
- `createColorResolver(overrides: Record<string, string> = {}): ColorResolver` → `createColorResolver(): ColorResolver`;内部 `category`/`categoryPillBg` 改调 `categoryColorFor(name ?? "")`(不传 overrides)。

- [ ] **Step 4: 跑 colors 测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/colors.test.ts`
Expected: PASS。

- [ ] **Step 5: 面板 + main 去 categoryColors 接线**

在 `src/agenda-panel/agenda-panel-view.ts`:
- 构造函数删参数 `private categoryColors: Record<string, string>,`。
- `render()` 里 `const colors = createColorResolver(this.categoryColors);` 改为 `const colors = createColorResolver();`

在 `src/main.ts` 的 `registerView` 工厂:删 `AgendaPanelView(...)` 最后的实参 `this.settings.categoryColors,`(构造回到 5 参)。

- [ ] **Step 6: 从 settings 删 categoryColors**

在 `src/settings/settings.ts`:删 `categoryColors` 接口字段(含注释)、`DEFAULT_SETTINGS.categoryColors`、`sanitizeSettings` 的 `strMap` 帮助函数 + 返回对象的 `categoryColors` 行。

在 `tests/settings/settings.test.ts`:删期望对象里的 `categoryColors: {}` 行;删 Task-1 遗留提到 categoryColors 的那条 "keeps a category-colors map…" 用例(整条删)。

- [ ] **Step 7: 删 settings-tab 分类颜色 UI**

在 `src/settings/settings-tab.ts`:
- 删这三行:`containerEl.createEl("h3", { text: "分类颜色(可选覆盖)" });` / `const catWrap = containerEl.createDiv();` / `this.renderCategoryColors(catWrap);`
- 删整个 `private renderCategoryColors(wrap: HTMLElement): void { ... }` 方法。

- [ ] **Step 8: build + 全量 + 视图自动色回归确认**

Run: `npm run build`
Expected: exit 0(尤其无"createColorResolver 期望 0 参得到 1 个"/"categoryColors 不存在")。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿(列表/日/周/月/统计视图的自动派色用例仍过——证明视图配色未受影响)。
Run: `git grep -n "categoryColors" -- src/ tests/` —— 期望**无输出**。

- [ ] **Step 9: 提交**

```bash
git add src/settings/settings.ts src/settings/settings-tab.ts src/agenda-panel/colors.ts src/agenda-panel/agenda-panel-view.ts src/main.ts tests/settings/settings.test.ts tests/agenda-panel/colors.test.ts
git commit -m "refactor(v4): remove category-color override setting (keep automatic palette in views)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 更名 Ogenda(manifest)

**Files:**
- Modify: `manifest.json`

**Interfaces:**
- Consumes: 无。
- Produces: 插件显示名 "Ogenda";描述去邮件化。`id` 不变。

- [ ] **Step 1: 改 manifest**

在 `manifest.json`:
- `"name": "ogenda"` → `"name": "Ogenda"`。
- `"description": "Sync schedule events from mailbox accounts into your vault, with an agenda view."` → `"description": "Two-way calendar sync (CalDAV/iCloud) with an agenda view."`
- `"id"` / `"version"` / `"minAppVersion"` / `"author"` / `"isDesktopOnly"` **不动**。

> 面板视图标题、命令名、ribbon 等展示串暂不动——由**计划二 i18n** 统一用词表处理(产品名 "Ogenda" 作为不翻译常量)。

- [ ] **Step 2: build 确认**

Run: `npm run build`
Expected: exit 0(esbuild 会把 manifest 一并处理;JSON 合法即可)。
Run: `python3 -c "import json;print(json.load(open('manifest.json'))['name'])"`
Expected: 打印 `Ogenda`。

- [ ] **Step 3: 提交**

```bash
git add manifest.json
git commit -m "chore(v4): rename plugin display name to Ogenda + de-email description (id unchanged)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review(计划一)

- **Spec 覆盖**:删邮件(§5)→ Task 1;删分类颜色设置(§6)→ Task 2;更名(§1)→ Task 3。**不含**:i18n(计划二)、单选同步框架/ICS(计划三)。
- **占位扫描**:Task 1 Step 1 里 `scanCount: undefined as never` 是**显式标注要删**的提示行,非残留占位;其余无 TBD。
- **类型一致**:`createColorResolver()`/`categoryColorFor(name)` 去参后,视图 `colors.category(name)` 接口不变;面板构造 6→5 参与 main.ts 调用一致;`OgendaSettings` 减 4 字段(email/appPassword/scanCount/categoryColors)与 sanitize/测试一致。
- **保留项**:`SyncService`、iCloud 命令/设置、视图自动派色 —— 均按 spec 不动。
- **依赖**:本计划无前置;计划二/三在其后。
