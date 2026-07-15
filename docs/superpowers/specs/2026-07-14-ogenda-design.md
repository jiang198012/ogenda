# ogenda 设计文档

- 日期:2026-07-14
- 状态:已确认(待用户复核 spec)
- 参考:`elias-shalom/obsidian-agenda`(仅借鉴议程视图 UI 思路,其本身不含任何邮箱同步)

---

## 1. 定位

Obsidian **桌面端**日程管理插件。核心能力:

1. 从邮箱账户**单向**同步日程事件到本地 vault;
2. 以**议程视图**呈现;
3. 支持对任一事件"**拉出**"一个独立 md 笔记做深度记录。

测试环境:本机 Obsidian demo vault(桌面端 = Electron + Node.js)。

---

## 2. 目标 / 非目标

### MVP 目标(本 spec 覆盖的第一刀)
- 一个连接器:**Gmail IMAP 邀请解析**(抓收件箱里的会议邀请邮件 `.ics`,解析成事件)。
- 一个视图:**议程列表**(按天分组)。
- 月度文件存储 + 按 `uid` 去重的 upsert。
- 从事件**拉出独立笔记**并双向链接。
- 手动 `Sync now` 命令 + 启动时同步一次。
- Gmail App 专用密码认证,密钥经 Electron `safeStorage` 加密存储。

### 非目标(留好接口,后续阶段)
- Exchange/Graph 连接器(需 O365 账户才能测)。
- Google Calendar(CalDAV/Google API)连接器。
- 月历网格 / 周 / 日 / 年视图、表格视图。
- **双向同步**(往邮箱服务器写回)。IMAP 天生无法写日历;写回只对 Graph/EWS 成立,超出本项目当前范围。
- 循环事件的**完整展开渲染**(字段先存,展开渲染是独立后续阶段)。
- 手机端(iOS/Android)。移动端无 Node、开不了原始 TCP,IMAP 需另搭中转服务,单独立项。

---

## 3. 关键决策记录(brainstorm 结论)

| # | 决策 | 结论 |
|---|---|---|
| 1 | 产品性质 | "**agenda**"(日程),非 AI agent。不含 AI。 |
| 2 | 数据来源(远期) | IMAP 邀请 + Exchange/Graph 真日历(C);MVP 只做前者 |
| 3 | 平台 | **桌面端 only** |
| 4 | 同步方向 | **单向导入**(mail → vault);本地事件可建但不写回 |
| 5 | 存储形态 | **一月一 md 文件**(总账)+ 按需拉出的单事件笔记(混合式) |
| 6 | 事件条目格式 | **格式1**:二级标题 + `key:: value` 字段清单 + 其下用户散文 |
| 7 | 字段 | 富**超集** schema,feature-gated 激活;循环重复在范围内(独立模块) |
| 8 | 测试账户 | **Gmail** |
| 9 | 第一连接器 | **Gmail IMAP 邀请解析**(唯一现在可端到端测的) |
| 10 | MVP 视图 | **仅议程列表** |

> 重要错配已澄清:Gmail **没有** Exchange 日历;其真日历是 Google Calendar(CalDAV/Google API,非 Graph)。故 Gmail 只能验证 IMAP 这条线。

---

## 4. 架构:连接器抽象

```
Connector(数据源) ──► 归一化 AgendaEvent ──► MonthlyStore.upsert(按 uid 就地更新)
                                                      │
                                                      ▼
                                            Agenda/YYYY-MM.md(总账)
                                              │                 │
                                              ▼                 ▼
                                       AgendaView 渲染     Spin-off 拉出笔记
```

- 每个数据源实现同一个 `Connector` 接口,统一吐出**归一化事件**进同一条管线。
- 加新源 = 加一个 connector,不改动下游(store / view / 命令)。

### 数据流
`Sync now` 或启动
→ `SyncService` 遍历启用的连接器
→ `Connector.fetch(range)` 返回 `AgendaEvent[]`(range = 未来 + 近 1 个月)
→ 按月分组
→ `MonthlyStore.upsert(month, events)`:**解析月度文件 → 按 `uid::` 匹配 → 命中则只更新机器字段、未命中则按时间插入、用户散文原样保留 → 整文件内存内合并后一次性写回**
→ `Notice` 报告(新增 / 更新 / 跳过 数)。

`AgendaView` 读取 `MonthlyStore.list(range)` 渲染。
`spin-off` 命令由事件生成独立笔记并回填 `note::` 链接。

---

## 5. 事件数据模型(AgendaEvent 超集字段)

标记:✅ = MVP 就填写;💤 = 字段先定义、后续按功能激活。
归属:🔒 = 同步机器托管(用户勿手改);✏️ = 用户可改。

### ① 身份与时间
| 字段 | 说明 | 状态 | 归属 |
|---|---|---|---|
| `uid::` | iCal UID / Graph iCalUId,**去重主键,永不变** | ✅ | 🔒 |
| `title::` | 标题 | ✅ | ✏️ |
| `start::` | 开始时间 ISO8601 | ✅ | 🔒/✏️ |
| `end::` | 结束时间 ISO8601 | ✅ | 🔒/✏️ |
| `all_day::` | 是否全天 true/false | ✅ | 🔒/✏️ |
| `tz::` | 时区,如 `Asia/Shanghai` | ✅ | 🔒 |

### ② 地点与接入
| `location::` 地点 ✅✏️ · `geo::` 纬经度 💤 · `url::` 线上会议链接 ✅ · `organizer::` 组织者 ✅ · `attendees::` 完整参会名单 ✅ |

### ③ 状态与分类
| `status::` confirmed/tentative/cancelled ✅ · `rsvp::` 我的回应 accepted/declined/tentative/none ✅ · `busy::` 忙闲 busy/free/oof ✅ · `category::`/`tags::` ✅✏️ · `priority::` 💤 · `color::` 💤 · `sensitivity::` 公开/私密 💤 |

### ④ 提醒
| `alarm::` 提前量(可多个,如 `-PT15M`)💤 |

### ⑤ 来源与同步(全 🔒)
| `origin::` synced/local ✅ · `source::` 如 `imap/gmail` ✅ · `protocol::` imap/graph ✅ · `etag::`/`change_key::` 变更令牌 ✅ · `seq::` 版本号 ✅ · `last_synced::` ✅ |

### ⑥ 记录关联
| `note::` `[[拉出的事件笔记]]` ✅ · 正文区(字段清单以下)= 描述 / 纪要 ✅✏️ |

### ⑦ 循环重复
| `rrule::` 重复规则 ✅ · `rdate::`/`exdate::` 附加/排除日期 💤 · `recur_id::`/`master_uid::` 实例↔主事件 ✅ |

> **schema 开放原则**:字段清单可扩展;插件只认识它管理的字段、**忽略未知字段**;新功能上线把对应字段从 💤 转 ✅,不破坏已有文件。

---

## 6. 存储契约

### 月度总账文件
- 路径:`Agenda/YYYY-MM.md`(存储根目录可在设置里改)。
- 多账户**合并**进同一月度文件,靠 `source::` 区分。
- 事件 = **格式1**:二级标题 + `key:: value` 字段清单 + 其下用户散文。
- **机器只拥有字段清单;标题以下的散文归用户,同步永不覆盖。**
- **边界规则(解析器契约)**:一个事件块从 `## ` 标题起;紧随其后**连续的 `- key:: value` 行**构成机器字段清单;**首个非字段行**起、直到下一个 `## ` 标题(或文件结尾)为止,全部视为用户散文,upsert 时原样保留。upsert 只增删改字段清单行,绝不触碰散文区。

示例(`Agenda/2026-07.md`):
```markdown
## 15:00–16:00 团队周会
- uid:: abc123@mail.gmail.com
- start:: 2026-07-14T15:00
- end:: 2026-07-14T16:00
- all_day:: false
- tz:: Asia/Shanghai
- location:: 会议室A
- organizer:: alice@example.com
- status:: confirmed
- rsvp:: accepted
- origin:: synced
- source:: imap/gmail
- protocol:: imap
- last_synced:: 2026-07-14T09:00
- note:: [[团队周会 2026-07-14]]

> 这行以下是我自己记的东西,同步不会动它。
- [ ] 会前准备材料
```

### 拉出的单事件笔记
- 路径:`Agenda/notes/<slug>.md`。
- frontmatter 带 `uid / title / start`,并反链月度文件。
- 生成时把月度文件对应条目的 `note::` 回填为该笔记的 `[[wikilink]]`(双向链接,避免重复拉出)。

---

## 7. 模块划分(单一职责、可独立测试)

| 模块 | 职责 | 可测性 |
|---|---|---|
| `core/event.ts` | 规范事件模型 AgendaEvent | 纯,单测 |
| `core/ical-map.ts` | ICS VEVENT → AgendaEvent 映射 | 纯,单测 |
| `connectors/connector.ts` | 连接器接口 `fetch(range) → AgendaEvent[]` | — |
| `connectors/gmail-imap.ts` | imapflow 连 Gmail、抓邀请邮件 | 集成测(真账户) |
| `connectors/mime-ics.ts` | 从邮件 MIME 抽 `text/calendar`/`.ics` | 纯,单测 |
| `store/monthly-file.ts` | 单个月度文件解析/序列化(格式1),round-trip 保真 | 纯,单测(**最关键**) |
| `store/monthly-store.ts` | 跨月 upsert / list,按 uid 就地更新、绝不碰散文 | 单测 |
| `sync/sync-service.ts` | 跑连接器→归一→按月分组→upsert→Notice | 单测(mock) |
| `views/agenda-view.ts` | 议程列表 ItemView,按天分组,行操作 | 手动 e2e |
| `commands/spin-off.ts` | 从事件生成独立笔记 + 回填 `note::` | 单测 + e2e |
| `settings/settings.ts` | 设置数据结构 + 读写 | 单测 |
| `settings/settings-tab.ts` | 设置界面(账户、同步选项、存储路径) | — |
| `settings/secret-store.ts` | Electron `safeStorage` 加解密封装 | — |
| `main.ts` | 装配:注册视图/命令、启动同步 | — |

---

## 8. 同步流程细节

- **触发**:MVP = 手动 `Sync now` 命令 + 启动时同步一次;**不做**后台定时(后续阶段加可配置 interval)。
- **扫描范围**:先扫 Gmail `INBOX` 里的日历邀请(含 `text/calendar` 部分或 `.ics` 附件);时间窗 = **未来 + 近 1 个月内**的事件。
- **去重**:以 `uid::` 为主键 upsert;同一事件重复同步只更新、不新增。
- **报告**:同步结束 `Notice` 显示 新增/更新/跳过 计数;失败给出可读错误。

---

## 9. 认证与密钥

- **Gmail IMAP 认证**:App 专用密码(前提:账户已开两步验证)。零云项目、零 OAuth 同意屏,可立即测试。OAuth2(XOAUTH2)留作后续。
- **密钥存储**:App 密码经 **Electron `safeStorage`** 加密(系统钥匙串)后再落盘,**明文不进 vault**。若 `safeStorage` 不可用则拒绝保存并提示(不退回明文)。

---

## 10. 错误处理与数据安全(第一原则:不破坏用户数据)

- upsert **每月文件内存内合并、一次性写回**;解析有歧义的条目**宁可跳过不写**并告警,绝不冒险覆盖散文。
- 单个 ICS 损坏 → 跳过该事件、记录日志、继续。
- 连接器失败(认证/网络)→ `Notice` 提示,不崩溃、不写半成品文件。
- 长期密钥永不明文落盘(见 §9)。

---

## 11. 技术栈

- TypeScript + esbuild(Obsidian 标准插件模板)、`manifest.json`。
- IMAP:`imapflow`(依赖 Node `net`/`tls`,须解析到 Electron 自带 Node)。
- ICS 解析:`ical.js`(Mozilla,支持 RRULE/时区,为后续循环阶段铺路)。
- 无数据库;状态 = 月度 md 文件 + `data.json` 设置。
- 单测:vitest(纯模块)。

> 具体库版本在 Phase 0 探针中确认后再钉死。

---

## 12. ⚠️ Phase 0 探针(头号风险,先做)

**`imapflow` 能否在 Obsidian 的 Electron 渲染进程里跑通,是整个项目最大未知。** Node 的 `net`/`tls`/`stream` 必须解析到 Electron 自带 Node,不能被 esbuild 打包/polyfill 掉。

**探针任务**:最小插件 → 用 App 密码连 Gmail IMAP → 把一封邀请邮件的原始 ICS 打到控制台。
**通过标准**:能成功建立 TLS 连接、拉到邮件、拿到 `text/calendar`/`.ics` 原文。
**若失败**:架构需改(退回"本地中转服务"方案),此时暂停并重新评审。

**这条路跑通之前,不建其余任何模块。**

---

## 13. 测试策略

- **纯模块单测(vitest)**:`ical-map`(ICS→事件)、`mime-ics`(MIME 抽取)、`monthly-file`(解析/序列化 round-trip)、`monthly-store`(upsert 保留散文、按 uid 去重)、`event`(序列化)。
- **IMAP 连接器**:逻辑用 mock 测;真实网络路径靠对真 Gmail 的**手动集成测**(在 demo vault 里)。
- **端到端**:加载进本机 demo vault → `Sync now` → 核对月度文件生成事件 → 拉出一个笔记 → 核对双向链接。

---

## 14. 项目结构

```
ogenda/
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  src/
    main.ts
    core/event.ts
    core/ical-map.ts
    connectors/connector.ts
    connectors/gmail-imap.ts
    connectors/mime-ics.ts
    store/monthly-file.ts
    store/monthly-store.ts
    sync/sync-service.ts
    views/agenda-view.ts
    commands/spin-off.ts
    settings/settings.ts
    settings/settings-tab.ts
    settings/secret-store.ts
  tests/
    ical-map.test.ts
    mime-ics.test.ts
    monthly-file.test.ts
    monthly-store.test.ts
  docs/
    superpowers/specs/2026-07-14-ogenda-design.md
```

---

## 15. 分阶段路线图

- **Phase 0** — imapflow-in-Electron 探针(硬风险验证)。
- **Phase 1(MVP)** — 事件模型 + 月度文件存储(格式1,upsert 保散文)+ Gmail IMAP 连接器 + 议程列表视图 + 拉出笔记 + 设置(safeStorage 密钥)+ 手动/启动同步。
- **Phase 2** — 月历网格视图;可配置定时同步。
- **Phase 3** — 循环事件完整展开(RRULE/exdate/时区/单实例 vs 整系列)。
- **Phase 4** — 第二/三连接器:Exchange/Graph(需 O365 账户)、Google Calendar(CalDAV/API)。
- **Phase 5(远期,可选)** — Graph/EWS 侧双向写回;移动端中转服务。

---

## 16. 未决事项

- 无阻塞性未决项。库的具体版本待 Phase 0 探针确认。
