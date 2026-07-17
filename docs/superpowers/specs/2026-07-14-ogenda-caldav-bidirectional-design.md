# ogenda 双向 CalDAV 日历同步 设计文档

- 日期:2026-07-14
- 状态:草案(待用户复核)
- **取代** `2026-07-14-ogenda-caldav-design.md`(那版是只读;用户已定要**双向**)。
- 重大定位:项目从"单向导入"升级为**双向日历同步引擎**(读+写+冲突)。iCloud 先行(basic auth),Google 后期(OAuth)。

---

## 1. 定位与关键决策

用户拍板:
- **双向**:Obsidian 既能把日历读进 vault,也能把 vault 里的建/改/删**写回**日历服务器。
- **协议 = CalDAV**(跨 provider 标准),**先拿 iCloud 练**(Apple ID + App 专用密码,basic auth),Google(CalDAV 需 OAuth)放后期——把"双向引擎"和"Google OAuth"两个硬坑拆开逐个攻。
- 复用已建:连接器抽象、`MonthlyStore`、`SyncService`、`ical.js`(解析**和**生成 VEVENT)、格式1 存储。

诚实提示(写进来备忘):双向同步是所有日历工具最难、最易出 bug 的部分(冲突/删除/循环)。必须**分阶段**、每阶段可测,严禁一步到位。

---

## 2. 目标 / 非目标

### 目标(分阶段,见 §10)
- CalDAV **只读导入**(D1):discovery → calendar-query → `icalToEvents` → 月度文件。
- CalDAV **写回**(D2):Obsidian 里新建/编辑事件 → 生成 VEVENT → `PUT`(带 `If-Match` ETag)回服务器。
- **冲突处理**(D3):两边都改 → MVP **server-wins**(见 §7);删除传播。
- iCloud(basic auth)全程可测;**Google(OAuth)= D5**。

### 非目标(后续/明确不做)
- 循环事件的写回(改单个实例 vs 整个系列)——极难,D2/D3 只支持非循环事件写回;循环事件**只读**。
- 实时推送(iCloud/CalDAV 无 webhook)——只轮询。
- 多设备三方合并、离线队列等高级同步语义。
- 待办(VTODO)、共享/邀请回复(RSVP 写回)——后续。

---

## 3. 架构

```
CalDavAccount(iCloud: url + AppleID + app密码)
  ─ discover()  → principal → calendar-home(分区主机)→ 日历列表
  ─ pull()      → REPORT calendar-query → VEVENT(+href+etag) → icalToEvents → 归一化
  ─ push(ops)   → 本地变更 → 生成 VEVENT → PUT/DELETE(If-Match etag)
        ↓
   BidirectionalSyncService(读→算差异→写→冲突)
        ↓
   MonthlyStore(格式1;每事件多带 href::/etag:: 等同步元数据)
```

新增:`src/connectors/caldav/*`(discover / query / put-delete / xml)、`src/net/dav-request.ts`(requestUrl 封装 PROPFIND/REPORT/PUT/DELETE)、`src/sync/bidirectional.ts`(差异+冲突引擎)、`core/ical-gen.ts`(AgendaEvent → VEVENT ICS,用 ical.js 生成)。
微调:`core/ical-map.ts` 加 `protocol` 参数(caldav);`MonthlyStore`/格式1 增加同步元字段。

---

## 4. iCloud CalDAV 事实(已核实,2026-07)

- 端点 `https://caldav.icloud.com`(443);认证 **Apple ID email + 16 位 App 专用密码**,Basic over TLS,需账户开 2FA。改 Apple 主密码 → App 密码全作废。
- Discovery:`PROPFIND /` 求 `current-user-principal` → `PROPFIND {principal}` 求 `calendar-home-set` → 落到分区主机 `pNN-caldav.icloud.com`(**per-account,不可硬编码**)→ `PROPFIND {home} Depth:1` 列日历(看 `supported-calendar-component-set` 含 VEVENT)。
- **无 PATCH**:改事件必须整条 `PUT`(带 `If-Match: etag`);`DELETE` 同理带 `If-Match`。
- 无 webhook:只能轮询;增量用 `sync-collection` REPORT + sync-token(D4)。

---

## 5. 传输与解析

- **传输**:`requestUrl({url, method, headers, body, throw:false})`,`method` ∈ {PROPFIND, REPORT, PUT, DELETE};`headers` 带 `Authorization: Basic …`、`Depth`、`Content-Type`(`application/xml` 或 `text/calendar`)、写时 `If-Match`。看状态码:207 Multi-Status(读)、201/204(写)、412 Precondition Failed(冲突)。
- **XML**:内建 `DOMParser` 解析 multistatus。
- **候选库 tsdav**:能省掉手写 XML;但它用 `fetch`,Obsidian 渲染进程可能撞 CORS。D0 探针评估"能否给 tsdav 注入 requestUrl 适配器";不行就全程手写(默认路线)。
- **ICS 生成/解析**:`ical.js`(已在用)——`ICAL.Component` 建 VEVENT → `toString()` 得 ICS 用于 PUT。

---

## 6. 双向数据模型(核心难点)

每个已同步事件的格式1 块,除事件字段外,增加**同步元字段**(机器托管):
- `uid::` 去重主键;`href::` CalDAV 资源 URL;`etag::` 服务器版本;`base_hash::` 上次同步时事件字段的哈希(用于检测本地改动)。
- 散文区(标题以下)= **只留本地,永不回写日历**(日历无"笔记正文"概念)。

**一次同步的算法**:
1. **拉取**:calendar-query 得服务器事件集(uid→{vevent, href, etag})。
2. **对每个 uid 判定**(以本地块 vs 服务器 vs base_hash 三方比较):
   | 本地 | 服务器(etag) | 本地改动(hash≠base) | 动作 |
   |---|---|---|---|
   | 有 | etag 未变 | 否 | 无事 |
   | 有 | etag 未变 | **是** | **PUT** 本地版本(If-Match etag)→ 更新 etag/base_hash |
   | 有 | **etag 变** | 否 | 服务器更新 → 覆盖本地机器字段(留散文)、更新 etag/base_hash |
   | 有 | **etag 变** | **是** | **冲突** → §7(MVP server-wins) |
   | 无(仅服务器) | — | — | 新增到 vault |
   | 有(仅本地,无 href) | — | — | **本地新建** → PUT 创建 → 拿 href/etag |
   | 曾同步(有 href)但本地块已删 | — | — | **本地删除** → DELETE(If-Match)→ 移出跟踪 |

**本地改动检测** = 重新解析块,算当前事件字段哈希,与 `base_hash::` 比;不等即本地改过。
**本地删除检测** = 上次同步存过的 `href` 集合里,某 uid 本地块已消失 → 删除。

---

## 7. 冲突策略(MVP)

**server-wins,基于条件写**:所有 PUT/DELETE 带 `If-Match: <etag>`。若服务器返 **412**(服务器版本已变)→ 判为冲突 → **用服务器版本覆盖本地机器字段(保留散文)+ 更新 etag/base_hash + Notice 告知"本地改动未推送,已被服务器较新版本覆盖"**,并把被丢弃的本地改动记进日志。
→ 永不静默覆盖服务器数据。后续可加"最后写入赢"或"弹窗选"。

---

## 8. 设计决策(默认值,待用户确认)

1. **可从 Obsidian 写回的字段**:`title/start/end/all_day/location/description`。`rrule`(循环)**只读不写**(D2 不碰循环写回)。
2. **新建事件**:在月度文件里按格式1 手写一个块(无 href)即被视为"本地新建" → 下次同步 PUT 创建。(后续加"新建事件"命令/模板。)
3. **删除**:本地删块 = 删服务器事件(带 If-Match)。**D2 先不做删除传播**(风险高:误删),放 D3;D2 只做"建/改"。
4. **散文/笔记**:只留本地,不回写。
5. **冲突**:server-wins(§7)。
6. **多日历**:MVP 先同步一个日历(默认日历);多日历放 D4。

---

## 9. ⚠️ 风险 & Phase D0 探针

**头号未知**:`requestUrl` 运行期能否对 iCloud 发出 PROPFIND/REPORT/**PUT**/DELETE、带 `Depth`/`If-Match`、拿到 207/201/412。类型层可行(§5),需真机验证。

**Phase D0 探针**(对真实 iCloud 账户):
1. PROPFIND discovery → 拿到 principal + 分区主机 + 至少一个日历 URL。
2. calendar-query → 读到至少一条 VEVENT(+etag)。
3. **PUT 一个测试事件** → 201/204;再 calendar-query 确认它出现在 iCloud(用 iPhone/Mac 日历肉眼可见)。
4. **DELETE 该测试事件**(If-Match)→ 确认消失。
把每步状态码打控制台。**四步全通 = 双向传输可行,再建引擎**;若 PUT/DELETE 被 requestUrl 挡 → 退回桌面端 Node `https`(仅桌面),重评审。

---

## 10. 分阶段路线图

- **D0** — iCloud CalDAV 传输探针(读+写+删,硬风险)。**先做。**
- **D1** — CalDAV **只读导入**:discover + calendar-query + `icalToEvents`(加 protocol)+ 存 href/etag → 月度文件。端到端在 iCloud + demo-vault 验证。
- **D2** — **写回(建/改)**:本地改动检测(base_hash)、`ical.js` 生成 VEVENT、PUT(If-Match)、本地新建→创建。非循环事件。冲突走 server-wins。
- **D3** — **删除传播** + 冲突体验打磨(可选"弹窗选")。
- **D4** — 多日历/多账户;`sync-collection` 增量;定时同步。
- **D5** — **Google(OAuth2)** 作为新 provider 接入(CalDAV v2 `apidata.googleusercontent.com`);Exchange/Graph 后续。
- **D6** — 循环事件写回;移动端(requestUrl 两端可用,天然友好)。

---

## 11. 与已有工作的关系

`phase1b1-sync-pipeline`(FileStore/MonthlyStore/ObsidianFileStore/SyncService/Connector 抽象/`icalToEvents`/格式1)**是共享地基**,双向 CalDAV 直接在其上建。IMAP-invite 连接器保留为**次要来源**。诊断已清、该分支可并入 main 作基线。已建的 Gmail 明文密码存储对 iCloud(App 专用密码)同样适用。
