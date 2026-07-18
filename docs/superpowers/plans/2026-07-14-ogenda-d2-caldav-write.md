# ogenda D2 — CalDAV 写回(双向) Implementation Plan

> 分小步 TDD。删除传播不在 D2(放 D3);循环写回不在 D2(放 D6,循环事件只读)。

**Goal:** 在 Obsidian 里改/建(非循环)事件 → 推回 iCloud 日历。写时带 `If-Match: etag`;冲突(412)server-wins。

**核心机制(spec §6/§7):** 每事件存 `base_hash::` = 上次同步时日历字段的哈希。同步时:本地当前哈希 ≠ base_hash → 本地改过 → PUT。无 href 的块 = 本地新建 → PUT 创建。

## Global Constraints
- 复用 D0/D1:`davRequest`(PUT/If-Match)、`icalToEvents`、`MonthlyStore`、`parseMonthlyDoc`。
- 只写"日历字段"(title/start/end/all_day/location/description);metadata(href/etag/base_hash/source/protocol/origin)不进哈希、不写回日历。散文只留本地。
- 冲突 server-wins,永不静默覆盖服务器(靠 If-Match)。

---

### D2.1 ical-gen:AgendaEvent → VEVENT ICS(纯,TDD)
- `src/core/ical-gen.ts`:`eventToVCalendar(ev): string`(ical.js 生成 VCALENDAR+VEVENT:uid/summary/dtstart/dtend/location;all_day 用 VALUE=DATE)。
- 测试:属性性质——`icalToEvents(eventToVCalendar(ev))[0]` 的 uid/title/start/location ≈ ev(round-trip)。

### D2.2 hashEvent + base_hash(纯,TDD)
- `src/core/event.ts`:`hashEvent(ev|fields): string`(对日历字段规范化后哈希,如 FNV/简单 djb2,纯 JS 无依赖);`AgendaEvent` 加 `baseHash?`;`eventToFields` 写 `base_hash::`。
- 同步产出事件时(D1 连接器 + 本地读取)计算/带 base_hash。
- 测试:字段变→哈希变;metadata 变(etag/href)→哈希不变。

### D2.3 MonthlyStore.readEvents(集成逻辑,可 InMemory 测)
- `readEvents(): Promise<LocalEvent[]>`:读所有月度文件 → parse → 每块出 `{ uid, fields, prose, hasHref }`。测试用 InMemoryFileStore。

### D2.4 planSync 差异引擎(纯,TDD ——核心)
- `src/sync/plan.ts`:`planSync(server: AgendaEvent[], local: LocalEvent[]): { pushUpdate, pushCreate, applyServer, conflicts }`。
- 三方比较(spec §6 表):本地哈希 vs base_hash、server etag vs 本地 etag。TDD 覆盖各分支。

### D2.5 CalDavWriter(集成)
- `src/connectors/caldav/caldav-writer.ts`:`putEvent(url, ics, ifMatch?) → {status, etag}`、按 href PUT。用 davRequest。

### D2.6 双向 sync 编排 + 命令(集成 + e2e)
- `src/sync/bidirectional.ts`:readEvents + connector.fetch + planSync → 执行 pushUpdate/pushCreate(PUT If-Match,412→跳过让 server 赢)→ applyServer(经 MonthlyStore 落地,更新 etag/base_hash)。
- main 加命令 "Sync iCloud (two-way)"。demo-vault + iCloud e2e:改一个事件标题→同步→iPhone 日历里变了。

---
备注:D2 完成后 D3 = 删除传播 + 冲突体验。
