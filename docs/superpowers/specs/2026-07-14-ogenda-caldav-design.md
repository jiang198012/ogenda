# ogenda CalDAV 日历同步 设计文档

- 日期:2026-07-14
- 状态:草案(待用户复核 + 确认测试账户)
- 定位变更:**日历为第一优先级、跨 provider/协议**;IMAP 抓邀请降为次要。CalDAV 作为主力连接器。

---

## 1. 背景与重新定位

原 MVP 走"Gmail IMAP 抓邀请",但它本质只能抓"别人邮件发来的会议邀请",**不是真正的日历同步**,且绑定单一邮箱。用户明确要求:**重点是同步日历,且适用大部分邮件系统/协议,不仅仅是 Google**。

结论:主力连接器改为 **CalDAV**——日历领域的标准协议,一套代码覆盖最广(iCloud、Fastmail、Yahoo、Zoho、Nextcloud/ownCloud、SOGo/Radicale/Baïkal 等自建;Google 需 OAuth,单列后续)。

**架构无需重写**:spec §4 的连接器抽象本就是为多协议设计——每个源实现 `Connector` 吐归一化 `AgendaEvent`,下游归一化/月度存储/视图全部共享。CalDAV 只是**新增一个 connector**。

---

## 2. 目标 / 非目标

### MVP 目标(CalDAV 主力)
- **CalDAV 只读**(one-way import),**HTTP Basic 认证**(用户名 + App 专用密码),覆盖 iCloud/Fastmail/Nextcloud/Yahoo/Zoho/自建。
- 自动 **discovery**:从服务器 URL 找到用户 principal → calendar-home → 列出日历集合。
- 拉取事件:`REPORT calendar-query`(VEVENT + 时间范围)→ 每条 `calendar-data`(ICS)。
- 复用已建管线:`icalToEvents` 归一化 → `MonthlyStore` 写 `Agenda/YYYY-MM.md`(格式1、uid upsert、保散文)→ `SyncService` 编排 → "Sync now" 命令。
- 多日历合并进月度文件,靠 `source::`/日历名区分。

### 非目标(后续阶段)
- **Google CalDAV**(需 OAuth2,与 basic auth 两套)——单列 Phase C3。
- **Exchange / Outlook**(不走 CalDAV,需 Graph/EWS + OAuth)——单列。
- **写回**(双向):CalDAV 支持 PUT,但本项目仍单向导入。
- **增量同步**(sync-collection + sync-token):MVP 用时间范围 calendar-query 全量拉;增量后续加。
- **ICS-URL 订阅连接器**、**IMAP 增量**:已有/次要,后续按需。

---

## 3. 架构

```
CalDavConnector.fetch()
  → discovery(principal → home → calendars)
  → 每个日历 REPORT calendar-query → calendar-data(ICS/VEVENT)
  → icalToEvents(ics, source)  ← 复用
  → dedupeByUid                ← 复用
        ↓  归一化 AgendaEvent[]
  SyncService → MonthlyStore.sync → Agenda/YYYY-MM.md   ← 全部复用
```

新增/改动:
- 新增 `src/connectors/caldav/*`(client + discovery + query + XML 解析)。
- 新增 `src/net/dav-request.ts`(封装 `requestUrl` 发 PROPFIND/REPORT)。
- 微调 `core/ical-map.ts`:`icalToEvents(ics, source, protocol = "imap")` 增加 `protocol` 参数(CalDAV 传 `"caldav"`),不破坏现有调用。
- 复用不变:`connectors/connector.ts`、`store/*`、`sync/sync-service.ts`、`core/monthly-doc.ts`、`core/event.ts`。

---

## 4. CalDAV 协议流程

### 认证
HTTP **Basic**(`Authorization: Basic base64(user:appPassword)`)。多数 provider 用 App 专用密码(iCloud/Fastmail/Yahoo)或账户密码(自建)。Google 例外(OAuth,后续)。

### Discovery(标准 RFC 6764 + 4791)
1. 起点 URL:用户填的 base(或 `https://host/.well-known/caldav`)。
2. `PROPFIND` Depth:0 求 `current-user-principal` → principal URL。
3. `PROPFIND` principal 求 `calendar-home-set` → 日历根 URL。
4. `PROPFIND` calendar-home Depth:1 → 列出子集合;筛 `resourcetype` 含 `calendar` 的,取 `displayname`、`supported-calendar-component-set`(含 VEVENT 的)。

### 拉取事件(每个日历)
`REPORT` Depth:1,body = `calendar-query`,filter `VEVENT` + `time-range`(如 `[now-1月, now+12月]`),`prop` 请求 `calendar-data`:
```xml
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR">
    <c:comp-filter name="VEVENT">
      <c:time-range start="20260601T000000Z" end="20270701T000000Z"/>
    </c:comp-filter>
  </c:comp-filter></c:filter>
</c:calendar-query>
```
响应 `multistatus` 里每个 `response` 的 `calendar-data` 是一段 ICS(VCALENDAR+VEVENT)→ 逐个 `icalToEvents` → 汇总 `dedupeByUid`。

---

## 5. 传输与 XML 解析

- **传输**:Obsidian `requestUrl({ url, method, headers, body })`。`method` 为任意字符串(已核实类型),可发 `PROPFIND`/`REPORT`;`headers` 带 `Depth`、`Content-Type: application/xml; charset=utf-8`、`Authorization`;`body` 为 XML。`throw:false` 手动看状态码(207 Multi-Status 为正常)。
- **XML 解析**:渲染进程内建 `DOMParser`:`new DOMParser().parseFromString(text, "application/xml")`,用 `getElementsByTagNameNS`/遍历取 `href`、`calendar-data`、`current-user-principal` 等。**无需新依赖**。
- 桌面 + 移动:`requestUrl` 两端都可用(不像 IMAP 只能桌面)——CalDAV 天然对移动端友好(后续)。

---

## 6. 数据映射

- 复用 `icalToEvents`(§3 微调加 `protocol` 参数)。CalDAV 事件:`origin: synced`、`protocol: "caldav"`、`source: "caldav/<账户标签>"`(可含日历名)。
- `uid` 仍是去重主键;CalDAV 的 VEVENT 自带 UID。循环、全天、时区等由 `ical.js`/现有映射处理(循环完整展开仍属后续)。

---

## 7. 设置与密钥

CalDAV 账户配置(可多账户,MVP 先一个):
- `serverUrl`(base 或 well-known)、`username`、`appPassword`、可选 `accountLabel`。
- (可选)provider 预设下拉:iCloud `https://caldav.icloud.com`、Fastmail `https://caldav.fastmail.com/dav/`、Nextcloud `https://<host>/remote.php/dav/`、Yahoo `https://caldav.calendar.yahoo.com`、Generic(自填)。
- **密钥**:沿用已定的**明文持久化**方案(用户已拍板):`appPassword` 明文存 `data.json`,设置页警示;不用时在 provider 处撤销 App 密码。(safeStorage 在 Obsidian 渲染进程不可用,已探针证实。)

---

## 8. ⚠️ 风险 & Phase C0 探针

**头号未知**:Obsidian `requestUrl` 运行期能否真的发出 `PROPFIND`/`REPORT` 并带自定义 `Depth` 头、拿到 `207 Multi-Status` + XML body(底层 Electron net 对非标准方法的支持)。类型层允许(§5),但需运行期验证。

**Phase C0 探针**:最小命令 → 对一个真实 CalDAV 服务器发一次 `PROPFIND current-user-principal` + 一次 `calendar-query`,把响应状态码 + XML 打到控制台。通过=能拿到 principal 和至少一条 `calendar-data`。**跑通再建其余**;若 `requestUrl` 不支持这些方法,退回桌面端 Node `https`(仅桌面),届时重评审。

---

## 9. 测试前提(开放项,需用户确认)

CalDAV 的 basic-auth MVP 需要一个 **basic-auth 的 CalDAV 账户**来端到端测。**用户当前主要是 Gmail,而 Google CalDAV 需要 OAuth(app password 连不了 CalDAV)**——所以 Gmail 测不了 basic-auth CalDAV。

**待用户拍板:拿哪个账户测?**
- iCloud(Apple ID + App 专用密码)
- Fastmail / Nextcloud / 自建(用户名 + App 密码)
- 其它 basic-auth CalDAV
- 或:MVP 直接做 Google CalDAV(那要先做 OAuth,复杂度大幅上升)

此项不定,C1 无法端到端验证(同 Gmail 测不了 Exchange 的老问题)。

---

## 10. 分阶段路线图

- **Phase C0** — `requestUrl` PROPFIND/REPORT 运行期探针(硬风险)。
- **Phase C1(MVP)** — CalDAV basic-auth 连接器:discovery + calendar-query + XML 解析 + `icalToEvents`(加 protocol 参数)+ 设置项 + 接入 SyncService/"Sync now"。端到端在用户选定的 CalDAV 账户 + demo-vault 验证。
- **Phase C2** — 多日历/多账户;sync-token 增量;时间范围可配。
- **Phase C3** — Google CalDAV / Google Calendar(OAuth2);Exchange/Outlook(Graph)。
- **Phase C4** — ICS-URL 通用订阅连接器;IMAP 增量(收尾已建的 IMAP 路径)。

---

## 11. 与已有 IMAP 工作的关系

已建的 `phase1b1-sync-pipeline`(FileStore/MonthlyStore/ObsidianFileStore/SyncService/Connector 抽象/Gmail IMAP 连接器)**大部分是共享基础设施**,CalDAV 直接复用。IMAP-invite 连接器保留为**次要来源**。落地前需:①移除连接器里的临时诊断日志;②该分支并入 main 后,CalDAV 在其上开发。
