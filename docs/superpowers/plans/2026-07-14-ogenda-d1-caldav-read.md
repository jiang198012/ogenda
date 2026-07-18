# ogenda D1 — CalDAV 只读导入 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans / subagent-driven-development. Steps use `- [ ]`.

**Goal:** 把 D0 验证过的 discovery + calendar-query 演进成正式 `CalDavConnector`,把 iCloud 日历事件只读导入 vault 月度文件(复用现有管线),并存 `href`/`etag` 为 D2 写回铺路。

**Architecture:** 纯解析(CalDAV multistatus XML → {href,etag,ics})+ 纯映射(`icalToEvents` 加 protocol/href/etag)可单测;连接器的 discovery/query 走已建 `davRequest`(集成,需 iCloud)。下游 `MonthlyStore`/`SyncService` 复用。

## Global Constraints

- 复用 Phase 1a 核心 + D0 `src/net/dav-request.ts`。纯模块不 import obsidian。
- iCloud 事实(D0 报告):`<calendar-data>` 是 CDATA 包完整 VCALENDAR;日历集合自身那条 `<response>` 的 calendar-data=404 要**跳过**;只处理有 200 calendar-data 的成员资源。href 是路径,拼分区主机成完整 URL。
- 凭据照抄原样(见 credentials-verbatim);明文持久化。

---

### Task D1.1: icalToEvents 加 protocol 参数 + AgendaEvent 带 href/etag(TDD)

**Files:** Modify `src/core/event.ts`(+`href?`/`etag?`)、`src/core/ical-map.ts`(+`protocol` 参数);`tests/core/event.test.ts`、`tests/core/ical-map.test.ts`

- [ ] 加 `href?: string; etag?: string` 到 `AgendaEvent`;`eventToFields` 写 `href::`/`etag::`(照现有 set 模式,空则省)。测试断言。
- [ ] `icalToEvents(ics, source, protocol = "imap")`:把返回事件的 `protocol` 用参数值。测试:`icalToEvents(ics, "caldav/personal", "caldav")` 的事件 `protocol === "caldav"`、`source === "caldav/personal"`(现有 IMAP 调用不传第三参,仍 "imap",不破坏)。
- [ ] 全套绿 → commit。

### Task D1.2: parseCalendarQuery 纯解析(TDD,用 D0 真实 XML 做 fixture)

**Files:** Create `src/connectors/caldav/parse-report.ts`、`tests/connectors/caldav/parse-report.test.ts`

- [ ] `interface CalResource { href: string; etag: string; ics: string }`;`parseCalendarQuery(xml: string): CalResource[]`。
- [ ] 逻辑(用 DOMParser):遍历 `<response>`;取其 `<href>`(第一个,response 自身的)、`<getetag>`、`<calendar-data>`;**只保留 calendar-data 非空(有 BEGIN:VCALENDAR)的**;跳过集合自身(calendar-data 空/404)。
- [ ] 测试用 D0 报告里的真实响应片段做 fixture:一条集合自身(calendar-data 空→跳过)+ 一条真实事件(「出差北京」,有 CDATA VCALENDAR→保留),断言只返回 1 条、其 ics 含 `SUMMARY:出差北京`、etag 正确。
- [ ] 全套绿 → commit。

### Task D1.3: CalDavConnector(集成)

**Files:** Create `src/connectors/caldav/caldav-connector.ts`

- [ ] `class CalDavConnector implements Connector`,构造入 `{serverBase, user, pass, calendarUrl, label}`。`id = "caldav/" + label`。
- [ ] `fetch()`:REPORT calendar-query(davRequest,body 同 D0)→ `parseCalendarQuery` → 对每条 `icalToEvents(ics, this.id, "caldav")`,把 `href`/`etag` 赋到事件上 → `dedupeByUid`。(discovery 由用户在设置里粘 calendarUrl 提供,MVP 不自动 discover。)
- [ ] 构建绿(集成,行为在 D1.5 e2e 验)。commit。

### Task D1.4: 接线(设置 + 命令)

**Files:** Modify `src/main.ts`(加 "Sync iCloud calendar" 命令 → 用 CalDavConnector + MonthlyStore + SyncService);iCloud 设置项已有(user/pass/calUrl)。

- [ ] 加命令:构造 `CalDavConnector`({serverBase 从 calUrl 推、user、pass、calendarUrl、label:"icloud"})+ `MonthlyStore` + `SyncService([conn], store, Notice)` → syncNow。
- [ ] 移除 D0 探针命令(discovery/write/delete)——被正式流程取代?**保留 discovery** 帮用户拿 URL;移除 write/delete 探针。
- [ ] 构建 + 全套绿。commit。

### Task D1.5: 端到端(demo-vault + iCloud,手动)

- [ ] reload → 设置里 iCloud 凭据 + 日历 URL 已填 → 运行 "Sync iCloud calendar" → Notice `同步完成:新增 N…`;`Agenda/YYYY-MM.md` 出现真实 iCloud 事件(带 href::/etag::)。
- [ ] 再同步幂等;事件下手写散文再同步→保留。记录 + commit。

---

## 备注:D2(写回)在此之上加——本地改动检测(base_hash)、`ical.js` 生成 VEVENT、PUT(If-Match etag)。
