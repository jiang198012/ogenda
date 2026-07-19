# Ogenda v4:单选日历同步框架 + 全量中英 i18n + 设置重构 + 更名 设计

**目标**:把插件从"iCloud 专用 + Gmail 邮件邀请(前期失误)"重构为**严格单选的日历同步框架**(iCloud / 通用 CalDAV / ICS 订阅)、**全量中英 i18n(可切)**、**按功能分区的清爽设置面板**,并更名 **Ogenda**。

**背景**:v1–v3-UI 已完成(双向 CalDAV 同步 + Agenda 面板 + 视觉重塑,已合并入 main 并推 Harness)。本轮回应产品定位收敛:砍掉邮件(中期再做)、日历源可扩展但防写冲突(严格单选)、面向中英用户(全量 i18n)、设置面板按功能分区。

**非目标**:
- **邮件相关同步全部移除**(Gmail/QQ/163/华为/Outlook 等邮箱邀请抓取)—— 列中期规划,本轮不做、并删除现有 Gmail 实现。
- **Google/Outlook 原生日历(OAuth2)** —— 留后期,本轮日历源全为"密码/URL"型,不碰 OAuth。
- **i18n 仅中/英两语** —— 不做繁中/日文等。
- **分类颜色手动覆盖** —— 删设置那块(视图自动派色保留)。

**决策来源**:brainstorming(2026-07-19,逐问确认)——单选粒度=**严格全局单选**;邮件=**彻底移除**;日历源=**iCloud + 通用 CalDAV + ICS**;i18n=**中英全量**;分类色=**只删设置那块**;更名 **Ogenda**。

---

## 1. 更名 Ogenda

- `manifest.json`:`name` "ogenda" → **"Ogenda"**;`description` 改为日历同步向(去掉 "mailbox accounts",如 "Two-way calendar sync (CalDAV/iCloud) with an agenda view.")。
- **`id` 保持 "ogenda" 不变** —— 改 id 会让 Obsidian 视为新插件、丢现有 vault 数据与设置。
- 面板标题、命令名、文档里的展示名统一 "Ogenda"(产品名作为不翻译常量,见 §2)。

## 2. 全量中英 i18n

- 新增 `src/i18n/`:
  - `index.ts`:`t(key, params?)`(点分键如 `settings.sync.icloud`;缺键回退到英文键名)、模块级当前语言状态、`setLanguage(lang)`。
  - `zh.ts` / `en.ts`:键值词表(键集必须一致)。
- **语言选择**:设置顶部下拉三档 **跟随 Obsidian(默认)/ 简体中文 / English**。存 `settings.language: "auto" | "zh" | "en"`。
  - "跟随 Obsidian":读 Obsidian 界面语言(`window.localStorage.getItem("language")`,`zh*` → zh,其余 → en)。
  - 纯函数 `resolveLanguage(setting, obsidianLocale): "zh" | "en"` 便于测试。
- **切换即重渲染**:保存语言后重跑设置页 `display()` + 打开的面板 `render()`。
- **全量抽串**:现有 ~17 个源文件、~126 处中文硬串全部改为 `t("…")`,英文词表补齐;覆盖 **设置 / 五视图(清单·日·周·月·统计)/ 新建·编辑表单 / 通知·错误提示 / 命令名**。
- **不翻译**:产品名 "Ogenda"、状态英文机器值(`confirmed`/`tentative`/`cancelled`)、用户数据(分类名/标签/事件字段)。状态的**展示标签**(已确认/Confirmed 等)走词表。
- 中文日期(`date-format.ts`,格式 `2026年7月19日 星期日`)在 en 下改英文格式(如 `Sun, Jul 19, 2026`);`formatDate(d, lang)` 按语言分派。

## 3. 设置面板重构(分区)

自上而下:
- **① 语言 / Language**:语言下拉(§2)。
- **② 日历同步 / Calendar Sync**:
  - **单选**同步方式(下拉),存 `settings.syncProvider`:`关闭 / iCloud (CalDAV) / 通用 CalDAV / ICS 订阅`。
  - 选中项**下方只显示该方式的配置字段**(条件渲染):
    - **iCloud**:Apple ID、App 专用密码(password 输入,明文存 data.json + 警示文案)、日历 URL(+ discovery 探针命令帮拿 URL)。双向。
    - **通用 CalDAV**:日历 collection URL、用户名、密码。双向。
    - **ICS 订阅**:一条 ICS/webcal URL(**只读**,仅导入)。
  - **启动时自动同步**开关(`syncOnStartup`,改为触发所选源的同步)。
- **③ 存储 / Storage**:`storageFolder`、时区(现有,归入此区)。
- **移除**:Gmail 三字段(email/appPassword/scanCount)、"分类颜色"覆盖块。

## 4. 单选同步框架 + 分派

- 设置扩展:
  - `syncProvider: "none" | "icloud" | "caldav" | "ics"`(默认 `none`)。
  - iCloud 复用现有 `icloudUser` / `icloudAppPassword` / `icloudCalUrl`。
  - 新增通用 CalDAV:`caldavUrl` / `caldavUser` / `caldavPass`。
  - 新增 ICS:`icsUrl`。
- **命令统一为 "Sync calendar now / 立即同步日历"**,按 `syncProvider` 分派:
  - `icloud` / `caldav` → 现有 `syncBidirectional`(读+写+删+冲突),用对应源的凭据/URL。
  - `ics` → **新只读连接器 `IcsConnector`**,经 `SyncService` 只读 upsert(不 push/delete)。
  - `none` → 提示"未配置同步源"。
- **面板"保存/删除事件 → 触发同步"**同样按 provider 分派。**ICS 为只读**:本地可增改删(写入 vault),但不 push 回源 —— 首次在 ICS 下编辑给一次性 Notice "ICS 为只读订阅,本地改动不会同步回源"。
- 保留 discovery 探针命令(iCloud;通用 CalDAV 亦可走同一 PROPFIND 流程)。
- 纯函数/服务层 `resolveSyncProvider(settings)`(返回 provider + 是否配置完整)便于测试选路。

## 5. 移除邮件(Gmail)

- 删 `src/connectors/gmail-imap.ts`、`package.json` 的 `imapflow` 依赖。
- 删 `main.ts` 的 "Sync now (Gmail invites)" 命令 + `syncNow()` + Gmail 凭据检查。
- 删 settings 的 `email` / `appPassword` / `scanCount` 字段 + settings-tab 的 Gmail UI。
- **保留 `SyncService`**(只读 upsert 编排),改用于 ICS 只读导入路径。
- 现有 "Sync iCloud calendar"(只读导入)命令**移除**:统一命令对 iCloud 走双向,已覆盖读。
- `manifest.description` 同步去邮件化(§1)。

## 6. 移除分类颜色设置

- 删 settings-tab 的 `renderCategoryColors` + "分类颜色" 段;删 `settings.categoryColors` 字段 + sanitize 的 `strMap`。
- `colors.ts` 的 `createColorResolver` 改为不接受 overrides(或恒空);面板构造去掉 `categoryColors` 参,`main.ts` 去掉传参。
- **视图自动派色不变**(分类色条/pill 保留)。

## 7. 新连接器

- **通用 CalDAV**:直接复用 `CalDavConnector`(读,配置 `{user,pass,calendarUrl,label}` 本就通用)+ `CalDavWriter`(写);仅接线通用 CalDAV 设置字段,无需新协议代码。
- **ICS 订阅 `IcsConnector`(新,只读)**:实现 `Connector.fetch()` —— GET(`webcal://` 归一为 `https://`)→ `icalToEvents(text)`(已测复用)→ `dedupeByUid` → 返回 `AgendaEvent[]`;不实现写。

## 8. 子计划拆分(写 plan 时)

- **计划一 · 清理与更名**:移除邮件(gmail-imap / 命令 / 设置字段 / imapflow)、移除分类颜色设置、更名 Ogenda。纯删减 + 改名,独立可交付、测试绿。
- **计划二 · i18n 基础设施 + 全量抽串**:`src/i18n/` + `resolveLanguage` + `formatDate(d,lang)` + 语言设置下拉 + 把 ~17 文件中文串抽成 `t()` + 英文词表 + 切换重渲染。
- **计划三 · 单选同步框架 + 新源**:`syncProvider` 枚举 + 各源配置 + 设置"日历同步"分区(单选 + 条件字段)+ 统一分派命令 + `IcsConnector`(只读)+ 面板按 provider 分派(ICS 只读提示)。
- 顺序建议 **一 → 二 → 三**:更名/清理先行,缩小后续 i18n 抽串面;i18n 基础设施在同步框架前铺好,新分区的串直接走词表。

## 9. 测试考虑

- **i18n**:`resolveLanguage`(auto/zh/en × Obsidian locale)、`t()` 缺键回退、zh/en 键集完整性(同键集)、`formatDate` 中英格式。
- **同步分派**:`resolveSyncProvider` 选路(icloud/caldav→bidirectional、ics→只读、none→提示)与"配置不完整"判定。
- **`IcsConnector.fetch`**:webcal 归一、`icalToEvents` 复用、只读(不产生 push/delete)。
- **设置 sanitize**:新增 `syncProvider`/通用 CalDAV/ICS/`language` 字段的类型与默认;移除的 Gmail/categoryColors 字段不残留。
- **设置面板条件渲染**:选 provider 只显对应字段(jsdom 结构断言,若 settings-tab 可测)。
- **移除邮件后**:全量测试无残留引用、`npm run build` 干净、无孤儿 import。

## 全局约束

- **minAppVersion 维持 1.5.0**;不碰 OAuth;明文密码只存 data.json(设置页警示)、绝不入仓库(`${VAR}` 占位);产品 id 不变。
- 测试 `node node_modules/vitest/vitest.mjs run`;构建 `npm run build`;提交尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
