# Ogenda v4 计划三:单选日历同步框架 + ICS 源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把同步从"iCloud 专用命令堆"重构为**严格单选的日历同步框架**:设置里一个"日历同步"分区,单选 `关闭 / iCloud / 通用 CalDAV / ICS 订阅`,只显示所选方式的配置;一个统一"立即同步日历"命令按所选方式分派(iCloud/CalDAV 走双向,ICS 走只读导入);新增只读 `IcsConnector`。

**Architecture:** `settings.syncProvider` 枚举 + 各源配置字段。纯函数 `resolveSyncProvider(settings)` 判断选了哪个源、配置是否完整(可测)。`IcsConnector`(实现 `Connector.fetch`)拉 ICS URL(`requestUrl` 无认证,`webcal://`→`https://`)→ `icalToEvents` → 只读。`main.ts` 的 `syncCalendarNow()` 按 provider 分派:iCloud/CalDAV → 现有 `syncBidirectional`(用对应源凭据);ICS → `SyncService` + `IcsConnector`(只读,不 push/delete);none/不完整 → 提示。设置页把 iCloud 段换成 provider 单选 + 条件字段。所有新串走 `t()`(计划二已建 i18n)。

**Tech Stack:** TypeScript、Obsidian API、vitest + jsdom、esbuild。

**依赖:** 在 **v4 计划一(清理)+ 计划二(i18n)之后**。新 UI 串直接用计划二的 `t()` + `zh.ts`/`en.ts`(键集一致测试守护)。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**;不碰 OAuth;明文密码只存 data.json(设置页警示)、绝不入仓库。
- **严格单选**:`syncProvider` 是单枚举,同一时刻只一个源;设置页只显所选源字段。
- **不破坏既有**:`syncBidirectional`/`CalDavConnector`/`CalDavWriter`/`SyncService`/`icalToEvents` 复用不改逻辑;iCloud 现有字段(`icloudUser`/`icloudAppPassword`/`icloudCalUrl`)沿用。
- **ICS 只读**:不实现写;面板在 ICS 下编辑为本地-only,给一次性提示。
- 新增 UI 串**全走 `t()`**,zh/en 成对加键(键集一致)。
- 测试 `node node_modules/vitest/vitest.mjs run <path>`(勿 npx);构建 `npm run build`;提交尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **⚠️ 测试类型陷阱**:tsc 不检 tests/、vitest 不做类型检查——每任务改完 `git grep` 核残留 + 手工确认测试签名。

---

### Task 1: settings 同步框架字段

**Files:**
- Modify: `src/settings/settings.ts`
- Modify: `tests/settings/settings.test.ts`

**Interfaces:**
- Produces:
  - `OgendaSettings.syncProvider: "none" | "icloud" | "caldav" | "ics"`(默认 `"none"`)
  - `caldavUrl`/`caldavUser`/`caldavPass`(通用 CalDAV,默认 `""`)
  - `icsUrl`(默认 `""`)

- [ ] **Step 1: 改测试**

在 `tests/settings/settings.test.ts` 第一个用例期望对象加:`syncProvider: "none",`、`caldavUrl: "",`、`caldavUser: "",`、`caldavPass: "",`、`icsUrl: "",`。末尾加:

```ts
  it("keeps a valid syncProvider and defaults to none", () => {
    expect(sanitizeSettings({ syncProvider: "icloud" }).syncProvider).toBe("icloud");
    expect(sanitizeSettings({ syncProvider: "caldav" }).syncProvider).toBe("caldav");
    expect(sanitizeSettings({ syncProvider: "ics" }).syncProvider).toBe("ics");
    expect(sanitizeSettings({ syncProvider: "bogus" }).syncProvider).toBe("none");
    expect(sanitizeSettings({}).syncProvider).toBe("none");
  });
```

- [ ] **Step 2: 跑 RED**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts` → FAIL。

- [ ] **Step 3: 实现**

在 `src/settings/settings.ts`:
- 接口加(在 language 前后均可):
  ```ts
  syncProvider: "none" | "icloud" | "caldav" | "ics";
  caldavUrl: string;
  caldavUser: string;
  caldavPass: string;
  icsUrl: string;
  ```
- DEFAULT 加:`syncProvider: "none", caldavUrl: "", caldavUser: "", caldavPass: "", icsUrl: "",`
- sanitize 加 helper 与返回行:
  ```ts
  const provider = (v: unknown): OgendaSettings["syncProvider"] =>
    v === "icloud" || v === "caldav" || v === "ics" ? v : "none";
  ```
  返回对象加:`syncProvider: provider(r.syncProvider), caldavUrl: str(r.caldavUrl, ""), caldavUser: str(r.caldavUser, ""), caldavPass: str(r.caldavPass, ""), icsUrl: str(r.icsUrl, ""),`

- [ ] **Step 4: GREEN + build + 全量**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`;`npm run build`;`node node_modules/vitest/vitest.mjs run`。全绿。

- [ ] **Step 5: 提交**

```bash
git add src/settings/settings.ts tests/settings/settings.test.ts
git commit -m "feat(v4-sync): settings — syncProvider enum + generic CalDAV/ICS fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: resolveSyncProvider 纯函数(选路 + 完整性)

**Files:**
- Create: `src/sync/resolve-provider.ts`
- Test: `tests/sync/resolve-provider.test.ts`

**Interfaces:**
- Produces:
  - `type SyncResolution = { provider: "none" } | { provider: "incomplete"; which: "icloud" | "caldav" | "ics" } | { provider: "icloud" | "caldav"; user: string; pass: string; calUrl: string } | { provider: "ics"; url: string }`
  - `function resolveSyncProvider(s: Pick<OgendaSettings, "syncProvider" | "icloudUser" | "icloudAppPassword" | "icloudCalUrl" | "caldavUrl" | "caldavUser" | "caldavPass" | "icsUrl">): SyncResolution`

判定规则:`none` → `{provider:"none"}`;`icloud` → 需 icloudUser+icloudAppPassword+icloudCalUrl 都非空,否则 `{provider:"incomplete", which:"icloud"}`;`caldav` → 需 caldavUrl+caldavUser+caldavPass;`ics` → 需 icsUrl。

- [ ] **Step 1: 写失败测试**

创建 `tests/sync/resolve-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSyncProvider } from "../../src/sync/resolve-provider";

const base = {
  syncProvider: "none" as const,
  icloudUser: "", icloudAppPassword: "", icloudCalUrl: "",
  caldavUrl: "", caldavUser: "", caldavPass: "", icsUrl: "",
};

describe("resolveSyncProvider", () => {
  it("none", () => {
    expect(resolveSyncProvider({ ...base })).toEqual({ provider: "none" });
  });
  it("icloud complete -> creds", () => {
    expect(
      resolveSyncProvider({ ...base, syncProvider: "icloud", icloudUser: "u", icloudAppPassword: "p", icloudCalUrl: "https://c" }),
    ).toEqual({ provider: "icloud", user: "u", pass: "p", calUrl: "https://c" });
  });
  it("icloud missing url -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "icloud", icloudUser: "u", icloudAppPassword: "p" })).toEqual({
      provider: "incomplete",
      which: "icloud",
    });
  });
  it("caldav complete -> creds", () => {
    expect(
      resolveSyncProvider({ ...base, syncProvider: "caldav", caldavUrl: "https://c", caldavUser: "u", caldavPass: "p" }),
    ).toEqual({ provider: "caldav", user: "u", pass: "p", calUrl: "https://c" });
  });
  it("caldav missing pass -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "caldav", caldavUrl: "https://c", caldavUser: "u" })).toEqual({
      provider: "incomplete",
      which: "caldav",
    });
  });
  it("ics complete -> url", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "ics", icsUrl: "https://x.ics" })).toEqual({
      provider: "ics",
      url: "https://x.ics",
    });
  });
  it("ics missing url -> incomplete", () => {
    expect(resolveSyncProvider({ ...base, syncProvider: "ics" })).toEqual({ provider: "incomplete", which: "ics" });
  });
});
```

- [ ] **Step 2: 跑 RED**

Run: `node node_modules/vitest/vitest.mjs run tests/sync/resolve-provider.test.ts` → FAIL。

- [ ] **Step 3: 实现**

创建 `src/sync/resolve-provider.ts`:

```ts
import { OgendaSettings } from "../settings/settings";

export type SyncResolution =
  | { provider: "none" }
  | { provider: "incomplete"; which: "icloud" | "caldav" | "ics" }
  | { provider: "icloud" | "caldav"; user: string; pass: string; calUrl: string }
  | { provider: "ics"; url: string };

type SyncSettings = Pick<
  OgendaSettings,
  | "syncProvider"
  | "icloudUser"
  | "icloudAppPassword"
  | "icloudCalUrl"
  | "caldavUrl"
  | "caldavUser"
  | "caldavPass"
  | "icsUrl"
>;

export function resolveSyncProvider(s: SyncSettings): SyncResolution {
  switch (s.syncProvider) {
    case "icloud":
      if (s.icloudUser && s.icloudAppPassword && s.icloudCalUrl) {
        return { provider: "icloud", user: s.icloudUser, pass: s.icloudAppPassword, calUrl: s.icloudCalUrl };
      }
      return { provider: "incomplete", which: "icloud" };
    case "caldav":
      if (s.caldavUrl && s.caldavUser && s.caldavPass) {
        return { provider: "caldav", user: s.caldavUser, pass: s.caldavPass, calUrl: s.caldavUrl };
      }
      return { provider: "incomplete", which: "caldav" };
    case "ics":
      if (s.icsUrl) return { provider: "ics", url: s.icsUrl };
      return { provider: "incomplete", which: "ics" };
    default:
      return { provider: "none" };
  }
}
```

- [ ] **Step 4: GREEN + build**

Run: `node node_modules/vitest/vitest.mjs run tests/sync/resolve-provider.test.ts`;`npm run build`。绿。

- [ ] **Step 5: 提交**

```bash
git add src/sync/resolve-provider.ts tests/sync/resolve-provider.test.ts
git commit -m "feat(v4-sync): resolveSyncProvider — single-select routing + completeness (pure)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: IcsConnector(只读 ICS 订阅源)

**Files:**
- Create: `src/connectors/ics/ics-connector.ts`
- Test: `tests/connectors/ics/ics-connector.test.ts`

**Interfaces:**
- Consumes: `Connector`(`{id, fetch}`)、`icalToEvents(ics, source, protocol)`、`dedupeByUid`、Obsidian `requestUrl`。
- Produces:
  - `function normalizeIcsUrl(url: string): string` —— `webcal://` → `https://`,`http(s)://` 原样,首尾 trim。
  - `class IcsConnector implements Connector`(构造 `(url, fetchImpl?)`;`fetch()` GET url → `icalToEvents(text, "ics", "ics")` → `dedupeByUid`;非 2xx 抛错)。默认 `fetchImpl` 用 `requestUrl`;测试可注入假 fetch。

> 用**可注入的 fetchImpl**(默认包一层 `requestUrl`)以便单测不打真实网络。`normalizeIcsUrl` 纯函数单独测。

- [ ] **Step 1: 写失败测试**

创建 `tests/connectors/ics/ics-connector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { IcsConnector, normalizeIcsUrl } from "../../../src/connectors/ics/ics-connector";

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1@ics
SUMMARY:订阅事件
DTSTART:20260720T090000
DTEND:20260720T100000
END:VEVENT
END:VCALENDAR`;

describe("normalizeIcsUrl", () => {
  it("webcal:// -> https://", () => {
    expect(normalizeIcsUrl("webcal://host/x.ics")).toBe("https://host/x.ics");
  });
  it("https stays, trims", () => {
    expect(normalizeIcsUrl("  https://host/x.ics ")).toBe("https://host/x.ics");
  });
});

describe("IcsConnector.fetch", () => {
  it("GETs the URL and parses VEVENTs into AgendaEvents", async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      return { status: 200, text: SAMPLE };
    };
    const c = new IcsConnector("webcal://host/x.ics", fake);
    const events = await c.fetch();
    expect(calls).toEqual(["https://host/x.ics"]); // normalized
    expect(events.length).toBe(1);
    expect(events[0].uid).toBe("evt-1@ics");
    expect(events[0].title).toBe("订阅事件");
  });
  it("throws on non-2xx", async () => {
    const fake = async () => ({ status: 404, text: "" });
    await expect(new IcsConnector("https://host/x.ics", fake).fetch()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑 RED**

Run: `node node_modules/vitest/vitest.mjs run tests/connectors/ics/ics-connector.test.ts` → FAIL。

- [ ] **Step 3: 实现**

创建 `src/connectors/ics/ics-connector.ts`:

```ts
import { requestUrl } from "obsidian";
import { AgendaEvent } from "../../core/event";
import { icalToEvents } from "../../core/ical-map";
import { Connector, dedupeByUid } from "../connector";

export function normalizeIcsUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("webcal://")) return "https://" + u.slice("webcal://".length);
  return u;
}

/** Minimal GET result the connector needs (matches Obsidian requestUrl's shape). */
export type IcsFetch = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetch: IcsFetch = (url) => requestUrl({ url, method: "GET", throw: false });

export class IcsConnector implements Connector {
  id = "ics";
  private url: string;
  constructor(url: string, private doFetch: IcsFetch = defaultFetch) {
    this.url = normalizeIcsUrl(url);
  }
  async fetch(): Promise<AgendaEvent[]> {
    const res = await this.doFetch(this.url);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ICS GET ${this.url} -> HTTP ${res.status}`);
    }
    return dedupeByUid(icalToEvents(res.text, "ics", "ics"));
  }
}
```

- [ ] **Step 4: GREEN + build + 全量**

Run: `node node_modules/vitest/vitest.mjs run tests/connectors/ics/ics-connector.test.ts`;`npm run build`;`node node_modules/vitest/vitest.mjs run`。全绿。

- [ ] **Step 5: 提交**

```bash
git add src/connectors/ics tests/connectors/ics
git commit -m "feat(v4-sync): IcsConnector — read-only ICS/webcal subscription (injectable fetch)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 设置页"日历同步"分区(单选 + 条件字段 + 分区重排)

**Files:**
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/i18n/zh.ts` / `src/i18n/en.ts`(新键)

**Interfaces:**
- Consumes: `t`、`resolveSyncProvider` 不需要;直接读/写 settings 字段。
- Produces:「日历同步」分区:provider 下拉(关闭/iCloud/通用 CalDAV/ICS)→ onChange 保存 + `this.display()` 重渲染;**只渲染所选 provider 的配置字段**。设置页整体分区:① 语言 → ② 日历同步(provider + 条件字段 + 启动自动同步)→ ③ 存储(storageFolder + 时区)。

- [ ] **Step 1: 加 i18n 键**

`zh.ts`/`en.ts` 各加(键集一致):
`settings.sync.section`(日历同步/Calendar sync)、`settings.sync.provider.name`(同步方式/Sync method)、`settings.sync.provider.desc`(同一时刻只启用一种,避免冲突/Only one active at a time, to avoid conflicts)、`settings.sync.provider.none`(关闭/Off)、`settings.sync.provider.icloud`(iCloud (CalDAV)/iCloud (CalDAV))、`settings.sync.provider.caldav`(通用 CalDAV/Generic CalDAV)、`settings.sync.provider.ics`(ICS 订阅(只读)/ICS subscription (read-only))、`settings.caldav.url.name`(CalDAV 日历 URL/CalDAV calendar URL)、`settings.caldav.user.name`(用户名/Username)、`settings.caldav.pass.name`(密码/Password)、`settings.caldav.pass.desc`(明文存 data.json/Stored in plaintext in data.json)、`settings.ics.url.name`(ICS / webcal URL/ICS / webcal URL)、`settings.ics.url.desc`(只读订阅,仅导入/Read-only subscription, import only)、`settings.storage.section`(存储/Storage)。

- [ ] **Step 2: 重写 settings-tab.ts 的 display()**

保留语言下拉(顶部)。**移除**原 iCloud 段(第 69–98 行那块 h3 + 3 个 Setting)。改为按分区渲染。整体 `display()` 参考:

```ts
  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    // ① 语言
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("auto", t("settings.language.auto"));
        d.addOption("zh", "简体中文");
        d.addOption("en", "English");
        d.setValue(s.language);
        d.onChange(async (v) => {
          s.language = v as "auto" | "zh" | "en";
          await this.plugin.saveSettings();
          setLanguage(resolveLanguage(s.language, getObsidianLocale()));
          this.display();
          this.plugin.refreshOpenPanels();
        });
      });

    // ② 日历同步
    containerEl.createEl("h3", { text: t("settings.sync.section") });
    new Setting(containerEl)
      .setName(t("settings.sync.provider.name"))
      .setDesc(t("settings.sync.provider.desc"))
      .addDropdown((d) => {
        d.addOption("none", t("settings.sync.provider.none"));
        d.addOption("icloud", t("settings.sync.provider.icloud"));
        d.addOption("caldav", t("settings.sync.provider.caldav"));
        d.addOption("ics", t("settings.sync.provider.ics"));
        d.setValue(s.syncProvider);
        d.onChange(async (v) => {
          s.syncProvider = v as typeof s.syncProvider;
          await this.plugin.saveSettings();
          this.display(); // re-render to show only the selected provider's fields
        });
      });

    if (s.syncProvider === "icloud") {
      new Setting(containerEl).setName(t("settings.icloud.user.name")).addText((x) =>
        x.setValue(s.icloudUser).onChange(async (v) => { s.icloudUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.icloud.appPassword.name")).setDesc(t("settings.icloud.appPassword.desc")).addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.icloudAppPassword).onChange(async (v) => { s.icloudAppPassword = v.trim(); await this.plugin.saveSettings(); });
      });
      new Setting(containerEl).setName(t("settings.icloud.calUrl.name")).setDesc(t("settings.icloud.calUrl.desc")).addText((x) =>
        x.setValue(s.icloudCalUrl).onChange(async (v) => { s.icloudCalUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
    } else if (s.syncProvider === "caldav") {
      new Setting(containerEl).setName(t("settings.caldav.url.name")).addText((x) =>
        x.setValue(s.caldavUrl).onChange(async (v) => { s.caldavUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.caldav.user.name")).addText((x) =>
        x.setValue(s.caldavUser).onChange(async (v) => { s.caldavUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.caldav.pass.name")).setDesc(t("settings.caldav.pass.desc")).addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.caldavPass).onChange(async (v) => { s.caldavPass = v.trim(); await this.plugin.saveSettings(); });
      });
    } else if (s.syncProvider === "ics") {
      new Setting(containerEl).setName(t("settings.ics.url.name")).setDesc(t("settings.ics.url.desc")).addText((x) =>
        x.setValue(s.icsUrl).onChange(async (v) => { s.icsUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
    }

    new Setting(containerEl)
      .setName(t("settings.sync.startup.name"))
      .setDesc(t("settings.sync.startup.desc"))
      .addToggle((tg) =>
        tg.setValue(s.syncOnStartup).onChange(async (v) => { s.syncOnStartup = v; await this.plugin.saveSettings(); }),
      );

    // ③ 存储
    containerEl.createEl("h3", { text: t("settings.storage.section") });
    new Setting(containerEl).setName(t("settings.storage.folder.name")).addText((x) =>
      x.setValue(s.storageFolder).onChange(async (v) => { s.storageFolder = v.trim() || "Agenda"; await this.plugin.saveSettings(); }),
    );
    new Setting(containerEl)
      .setName(t("settings.tz.name"))
      .setDesc(t("settings.tz.desc"))
      .addDropdown((d) => {
        d.addOption("", t("settings.tz.followSystem"));
        for (const opt of buildTimezoneOptions()) d.addOption(opt.iana, opt.label);
        d.setValue(s.timezone);
        d.onChange(async (v) => { s.timezone = v; await this.plugin.saveSettings(); });
      });
  }
```

> 注:回调参数名改用 `x`(不用 `t`)以免遮蔽 i18n `t()`。

- [ ] **Step 3: 验证**

Run: `git grep -nP "[\x{4e00}-\x{9fff}]" -- src/settings/settings-tab.ts` → 仅剩 `"简体中文"`。
Run: `node node_modules/vitest/vitest.mjs run tests/i18n/i18n.test.ts`(键集一致)→ 绿。
Run: `npm run build`;`node node_modules/vitest/vitest.mjs run` 全量 → 绿。

- [ ] **Step 4: 提交**

```bash
git add src/settings/settings-tab.ts src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(v4-sync): settings — Calendar Sync section (single-select provider + conditional fields)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: main.ts 统一同步分派 + 移除旧命令 + 接线

**Files:**
- Modify: `src/main.ts`
- Modify: `src/i18n/zh.ts` / `src/i18n/en.ts`(新键)

**Interfaces:**
- Consumes: `resolveSyncProvider`(Task 2)、`IcsConnector`(Task 3)、既有 `CalDavConnector`/`CalDavWriter`/`syncBidirectional`/`SyncService`。
- Produces:
  - 统一命令 `command.syncNow`("立即同步日历")→ `syncCalendarNow()`。
  - `syncCalendarNow()` 按 `resolveSyncProvider(settings)` 分派:`icloud`/`caldav` → `syncBidirectional`(用解析出的 user/pass/calUrl);`ics` → `SyncService([new IcsConnector(url)])`.syncNow()(只读);`none` → `notice.noSyncProvider`;`incomplete` → `notice.syncIncomplete`。
  - `syncOnStartup` 与面板 `triggerSync` 均改指向 `syncCalendarNow()`。
  - **移除** `caldavSync()`(旧只读 iCloud 导入)及其命令 `"Sync iCloud calendar"`。保留 `caldavSyncTwoWay`? → 用 `syncCalendarNow` 替代其命令;`caldavDiscover` 命令保留。

- [ ] **Step 1: 加 i18n 键**

`zh.ts`/`en.ts` 各加:`command.syncNow`(立即同步日历/Sync calendar now)、`notice.noSyncProvider`(未配置同步源(在设置里选)/No sync source configured (pick one in settings))、`notice.syncIncomplete`(所选同步源配置不完整/The selected sync source is not fully configured)、`notice.icsReadonly`(ICS 为只读订阅,本地改动不会同步回源/ICS is a read-only subscription; local edits won't sync back)、`notice.icsImportError`(ICS 导入出错:{msg}/ICS import error: {msg})。(`command.discovery`/`command.openPanel` 等已在计划二。)

- [ ] **Step 2: 重写 main.ts 的同步命令与方法**

- `onload()` 命令区:**删** `id: "ogenda-caldav-sync"`("Sync iCloud calendar")与 `id: "ogenda-caldav-sync-bidirectional"` 两条,**加**一条统一:
  ```ts
  this.addCommand({ id: "ogenda-sync-now", name: t("command.syncNow"), callback: () => void this.syncCalendarNow() });
  ```
  保留 `ogenda-caldav-discovery`(名走 `t("command.discovery")`,已在计划二)、`ogenda-open-agenda-panel`。
- **删** `caldavSync()` 方法整块。
- `caldavSyncTwoWay()` → 改名/替换为 `syncCalendarNow()`,内容改为按 provider 分派:
  ```ts
  async syncCalendarNow(): Promise<void> {
    const r = resolveSyncProvider(this.settings);
    if (r.provider === "none") { new Notice(t("notice.noSyncProvider")); return; }
    if (r.provider === "incomplete") { new Notice(t("notice.syncIncomplete")); return; }
    if (r.provider === "ics") {
      try {
        const svc = new SyncService([new IcsConnector(r.url)], this.store(), (m) => new Notice(m, 10000));
        await svc.syncNow();
      } catch (e) {
        new Notice(t("notice.icsImportError", { msg: (e as Error).message }));
        console.error("[ogenda] ics import error", e);
      }
      return;
    }
    // icloud | caldav → bidirectional
    const connector = new CalDavConnector({ user: r.user, pass: r.pass, calendarUrl: r.calUrl, label: r.provider });
    const writer = new CalDavWriter({ user: r.user, pass: r.pass });
    const source: CalDavSource = {
      fetch: () => connector.fetch(),
      putEvent: (url, ics, ifMatch) => writer.putEvent(url, ics, ifMatch),
      deleteEvent: (url, ifMatch) => writer.deleteEvent(url, ifMatch),
    };
    try {
      await syncBidirectional(source, r.calUrl, this.store(), (m) => new Notice(m, 10000));
    } catch (e) {
      new Notice(t("notice.icloudTwoWaySyncError", { msg: (e as Error).message }));
      console.error("[ogenda] bidirectional sync error", e);
    }
  }
  ```
- `registerView` 工厂里面板的 `triggerSync` 回调:`() => void this.caldavSyncTwoWay()` → `() => void this.syncCalendarNow()`。
- `syncOnStartup`:`onLayoutReady(() => void this.caldavSyncTwoWay())` → `onLayoutReady(() => void this.syncCalendarNow())`。
- import 加:`import { resolveSyncProvider } from "./sync/resolve-provider";`、`import { IcsConnector } from "./connectors/ics/ics-connector";`;删不再需要的 `icloudCreds()`(若 `caldavDiscover` 仍用它则保留——`caldavDiscover` 用 iCloud 凭据探针,保留 `icloudCreds()`;`syncCalendarNow` 不用它)。

- [ ] **Step 3: 验证**

Run: `git grep -nP "[\x{4e00}-\x{9fff}]" -- src/main.ts | grep -vE "//|/\*"` → 无(或仅 console.log 里的,确认非 UI)。
Run: `git grep -n "caldavSync\b\|caldavSyncTwoWay\|ogenda-caldav-sync\"" -- src/main.ts` → 确认旧命令/方法已删(只余 `caldavSyncTwoWay` 若改名则应无;`syncCalendarNow` 应在)。
Run: `npm run build` exit0;`node node_modules/vitest/vitest.mjs run` 全量绿。

- [ ] **Step 4: 真机目测(手动)**

真机:设置"日历同步"选 iCloud/通用 CalDAV → 填配置 → "立即同步日历"命令双向同步;选 ICS → 填 URL → 命令只读导入(改本地事件不回传);选"关闭"或配置不全 → 命令给对应提示。切 provider 时设置页只显对应字段。

- [ ] **Step 5: 提交**

```bash
git add src/main.ts src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(v4-sync): unified 'Sync calendar now' dispatch by provider (iCloud/CalDAV bidirectional, ICS read-only); drop legacy iCloud commands

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review(计划三)

- **Spec 覆盖**:单选框架(§4)→ Task 1/2/5;通用 CalDAV(§7)→ Task 2/5(复用 CalDavConnector/Writer);ICS 只读(§7)→ Task 3;日历同步分区(§3)→ Task 4;统一分派 + 移除旧命令(§4/§5)→ Task 5。
- **占位扫描**:纯函数(resolveSyncProvider/IcsConnector/normalizeIcsUrl)给了完整代码 + 测试;设置页/main 给了完整重写代码。
- **类型一致**:`SyncResolution` 判别联合贯穿 resolveSyncProvider → main 分派;`Connector` 接口被 IcsConnector 实现;settings 新字段 → resolveSyncProvider 消费。
- **单选/只读**:syncProvider 单枚举 + 条件字段渲染;ICS 无写路径(只 fetch)。
- **陷阱防护**:每任务 `git grep` 核残留;新 UI 串键集一致测试守护;IcsConnector 用可注入 fetch 避免真实网络。
- **依赖**:计划一/二之后;i18n 键直接进 zh/en。
