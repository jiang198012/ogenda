# Ogenda 备注字段 + 推送补全 + 往返一致 — Design

- 日期:2026-07-19
- 状态:设计已获用户批准(字段映射表、rsvp/tags 纯本地、attendees 照常推送均已拍板)
- 范围:四项合一 —— ① 标题输入框铺满;② 事件新增「备注」(iCal DESCRIPTION)全双向(拉取+推送);③ 推送补全(组织者/参与者/状态/分类/RRULE);④ 往返一致性配套(hashEvent 扩展、fieldsToEvent 补全、sync 路径字段清除)。

## 背景:三个真问题

1. **推送静默丢字段**:`ical-gen.ts eventToVCalendar` 只发 SUMMARY/LOCATION/DTSTART/DTEND 4 个字段 —— 表单里可编辑的组织者/参与者/状态/分类,推送时被丢弃。
2. **哈希不覆盖 → 不触发推送**:`hashEvent` 只哈希 title/start/end/allDay/location 5 个字段。改组织者等字段,`planSync` 的 localChanged 永远为 false,编辑永远到不了服务器。
3. **数据丢失(现行 bug)**:推送不带 RRULE —— 编辑一个重复事件的标题,PUT 全量替换会把服务器上的重复规则抹掉。

## 一致性铁律(本批核心约束)

**凡进 hashEvent 的字段,必须同时被:ical-map 解析 ∩ ical-gen 推送 ∩ md 存储 ∩ fieldsToEvent 重建。** 缺一环就会产生「推一遍、拉回来不一样、哈希对不上、再推」的同步抖动。本批所有字段决策都由此推出。

## 字段映射总表(用户已批准)

| 字段 | iCal | 拉取 | 推送 | 哈希 | 说明 |
|---|---|---|---|---|---|
| 标题/起止/全天/地点 | SUMMARY/DTSTART/DTEND/LOCATION | ✅ 已有 | ✅ 已有 | ✅ 已有 | 不动 |
| **备注** | DESCRIPTION | 🆕 | 🆕 | 🆕 | 本批主角,多行文本 |
| 组织者 | ORGANIZER:mailto: | ✅ 已有 | 🆕 | 🆕 | iCloud 可能改写为账号本人 → 以服务器为准,不自旋 |
| 参与者 | ATTENDEE 多行 | ✅ 已有 | 🆕 | 🆕 | 裸邮箱推送,见「已知限制」 |
| 状态 | STATUS | ✅ 已有(小写) | 🆕(线上大写) | 🆕 | 模型/存储保持小写,推送时 toUpperCase |
| 分类 | CATEGORIES | 🆕 | 🆕 | 🆕 | 单值;服务器多值只取第一个(记录在案) |
| 重复规则 | RRULE | ✅ 已有 | 🆕 | 否 | 修数据丢失;表单不可编辑,不进哈希 |
| rsvp、tags | — | 不解析 | 不推送 | 不哈希 | **保持纯本地**(用户已批准) |

**rsvp 保持本地的理由**:它在 iCal 里不是独立字段,而是「本人那条 ATTENDEE 的 PARTSTAT 参数」。双向需要识别本人 + 结构化保存每个参与者参数,属另批大改造。
**tags 保持本地的理由**:iCal 无标准字段,X- 私有属性有被 iCloud 剥离的风险(剥离即往返抖动)。

---

## A. 备注字段(DESCRIPTION)

### A1. 模型与 md 存储
- `AgendaEvent` 新增 `description?: string`。
- md 机器字段为单行格式,备注存**转义单行**(与 iCal 同一套转义的子集):`\` → `\\`、换行 → `\n`。读时反向。
  ```
  - description:: 带齐样品\n提前十分钟到
  ```
- `core/event.ts` 导出一对转义/反转义函数(如 `escapeMultiline`/`unescapeMultiline`),供三条转换路径共用。
- `eventToFields`:description 转义后写入(空/undefined 不写)。
- `fieldsToEvent`(plan.ts,同步哈希+推送载荷)与 `localToEvent`(agenda-panel,面板编辑):读取时反转义。
- 用户的 prose 散文区不动 —— 备注走机器字段、归同步管。

### A2. 拉取(ical-map)
- `ve.getFirstPropertyValue("description")` → `description`(ical.js 对 TEXT 值自动反转义,`\n`→换行、`\\`→`\`)。

### A3. 推送(ical-gen)
- 非空时 `DESCRIPTION:${escapeText(ev.description)}`。现有 `escapeText` 已处理 `\`→`\\`、换行→`\n`、`;`→`\;`、`,`→`\,`。

### A4. 表单
- `RawFormFields` 新增 `description: string`;构造 `existing?.description ?? ""`。
- 位置:**标签之后、「更多选项」之前**;`Setting.addTextArea`,约 5 行高(CSS min-height)。
- `buildEventFromFields`:`description: fields.description.trim() || undefined`(trim 保证往返稳定)。
- `PANEL_CLEARABLE_FIELDS` 加 `"description"` —— 表单清空保存 → md 删字段 → description 进哈希 → 触发推送 → 服务器端 DESCRIPTION 同步删除。
- **Enter 守卫**:表单有 Enter 保存,textarea 里 Enter 必须是换行。抽纯函数 `shouldSaveOnEnter(key, isComposing, targetIsTextarea, saveDisabled): boolean`(可单测),modal 的 keydown 改调它。

### A5. i18n(键集一致)
| 键 | zh | en |
|----|----|----|
| `form.description.name` | 备注 | Notes |

---

## B. 推送补全(ical-gen)

在现有 4 字段基础上,非空才输出:

- `ORGANIZER:mailto:<v>` —— 先剥除用户值里可能已带的 `mailto:` 前缀(不区分大小写)再补,防双重前缀。
- `ATTENDEE:mailto:<v>` —— attendees 每个一行,同样剥前缀。
- `STATUS:${status.toUpperCase()}` —— 模型存小写,线上 RFC 大写;解析侧已 toLowerCase,往返对齐。
- `CATEGORIES:${escapeText(category)}` —— 单值;escapeText 转义逗号,保证含逗号的分类名仍是单值。
- `RRULE:${rrule}` —— RRULE 是结构化值不是 TEXT,**不做** escapeText;原样输出解析时 stringified 的串。
- `DESCRIPTION` —— 见 A3。

### 已知限制(记录在案,用户已知悉)
- attendees 推送为裸 `mailto:`,**对方已有的答复状态(PARTSTAT)在推送后被服务器重置**;但仍优于现状(现状推送直接整条抹掉参与者)。彻底保真需结构化 attendees 改造(另批)。
- 推送含 ATTENDEE 的事件,iCloud 可能按 CalDAV 调度给参与者**发邀请邮件**(标准行为)。
- organizer 若被 iCloud 改写(如强制为账号本人),下一轮 applyServer 以服务器版本覆盖本地并跟随 baseHash,稳定不自旋。

## C. 解析补全(ical-map)

- `description` ← `getFirstPropertyValue("description")`。
- `category` ← `getFirstPropertyValue("categories")`:取第一个 CATEGORIES 属性的第一个值,String 化;多值/多行只取第一(记录在案)。**实现时用单元测试钉住 ical.js 对单值/多值/重复行的实际返回行为**,再定取法。
- 其余已有解析(organizer/attendees/status/rrule 等)不动。

---

## D. 往返一致性配套

### D1. hashEvent 扩展(core/event.ts)
canon 列表在现有 5 项后追加:
```
ev.description ?? "",
ev.organizer ?? "",
(ev.attendees ?? []).join(", "),
ev.status ?? "",
ev.category ?? "",
```
不进哈希:rsvp、tags、rrule、tz、url、busy 及一切同步元数据。attendees 用 `", "` 连接 —— 与 md 存储格式、表单 splitList 的输出一致,三条路径哈希同源。

### D2. fieldsToEvent 补全(sync/plan.ts)
现为 7 字段子集,是**推送载荷与哈希输入的共同来源**。补:`organizer`、`attendees`(split ", " 过滤空)、`status`、`category`、`description`(反转义)。

### D3. localToEvent 补全(agenda-panel/local-to-event.ts)
补:`description`(反转义)—— 面板编辑往返不丢备注。

### D4. sync 路径字段清除(monthly-store.ts)
现状:`store.sync` 的 upsertEvents 不传 clearFields → 服务器端删掉某字段后,本地 md 旧值永远残留,哈希对不上会把旧值推回去,和另一台设备打架。
- 新增 `SYNC_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "category", "description", "rrule"]`,`store.sync` 调用 upsertEvents 时传入。
- **绝不在内**:rsvp、tags(纯本地用户数据)、etag、href、base_hash、origin、source、protocol、seq、last_synced、url、busy、tz。
- 效果:服务器删字段 → applyServer → 本地 md 同步删除 → 不复活、不打架。applyServer/冲突(server 胜)/推送后回写三条路径同获此语义。
- `savePanelEvent` 的 `PANEL_CLEARABLE_FIELDS`(面板清空即删)加 `"description"`,其余不变。

### D5. stats.ts
复用 fieldsToEvent + hashEvent,自动跟随新语义,无需改动。

---

## E. 标题输入框铺满(CSS)

- modal 标题 Setting 行的 `settingEl` 加 class `ogenda-form-title`。
- styles.css:控制区伸展 + 输入框 `width: 100%`(具体选择器实现时定,目标:输入框占满该行控制区宽度)。
- 顺带:textarea 的宽度/最小高度样式(`.ogenda-form-desc textarea`)。

---

## 文件影响

- `src/core/event.ts`:`AgendaEvent.description`;`hashEvent` 扩展;`eventToFields` 写 description(转义);导出转义函数对。
- `src/core/ical-map.ts`:DESCRIPTION、CATEGORIES 解析。
- `src/core/ical-gen.ts`:推送扩字段(DESCRIPTION/ORGANIZER/ATTENDEE/STATUS/CATEGORIES/RRULE + mailto 剥前缀)。
- `src/sync/plan.ts`:`fieldsToEvent` 补全。
- `src/agenda-panel/local-to-event.ts`:description 反转义。
- `src/store/monthly-store.ts`:`SYNC_CLEARABLE_FIELDS` + sync 传入;`PANEL_CLEARABLE_FIELDS` 加 description。
- `src/agenda-panel/event-form-fields.ts`:`RawFormFields.description`;`buildEventFromFields`;`shouldSaveOnEnter` 纯函数。
- `src/agenda-panel/event-form-modal.ts`:标题 class;description textarea;Enter 守卫接线。
- `src/i18n/zh.ts` / `en.ts`:`form.description.name`。
- `styles.css`:标题铺满 + textarea。
- `tests/`:对应新增/更新。

## 测试计划

- **ical-gen**:各新字段序列化;description 换行/中文/分号/逗号/反斜杠转义;mailto 剥前缀(已带 mailto: 不双重);STATUS 大写;ATTENDEE 每人一行;RRULE 原样不转义;空字段不输出。
- **ical-map**:DESCRIPTION/CATEGORIES 解析;单值/多值/重复 CATEGORIES 行行为钉住。
- **往返一致性**:eventToVCalendar → icalToEvents → 同步字段集(title/start/end/allDay/location/description/organizer/attendees/status/category/rrule)逐项相等,用例含中文、换行、逗号分号、带 mailto: 的值。
- **hashEvent**:description/organizer/attendees/status/category 变化翻哈希;rsvp/tags/rrule 变化不翻。
- **转换层**:eventToFields↔fieldsToEvent/localToEvent 的 description 转义往返(含字面值 `\n` 反斜杠-n 不腐蚀);fieldsToEvent 新字段重建。
- **monthly-store**:SYNC_CLEARABLE_FIELDS —— 服务器事件缺字段 → md 对应字段删除;rsvp/tags/href/etag/base_hash 保留。PANEL_CLEARABLE 加 description 不回归。
- **event-form-fields**:buildEventFromFields 的 description 携带/trim/清空→undefined;shouldSaveOnEnter 各分支(Enter/非 Enter/IME/textarea/禁用)。
- **i18n** parity 自动守护。
- modal DOM(textarea、标题 class、Enter 接线)不可单测(obsidian 依赖)→ `npm run build` 干净 + 真机验收。

## 真机验收清单(iCloud)

1. 新建事件填备注(含换行)→ 推送 → 手机日历可见;手机改备注 → 同步回本地 md。
2. 备注含中文/换行/逗号/分号,连续同步两轮后 md 稳定(不抖动)。
3. 编辑重复事件标题 → 服务器 RRULE 保留。
4. 组织者/状态/分类推送生效;组织者若被 iCloud 改写以服务器为准且不循环推送。
5. 参与者推送可达(知悉可能触发邀请邮件)。
6. 手机上删除备注 → 本地 `description::` 同步删除,不复活。
7. 表单:标题输入框铺满;备注多行输入;备注里 Enter 换行、框外 Enter 保存。

## 非目标(YAGNI)

- rsvp 双向同步(PARTSTAT/本人识别大改造,另批)。
- tags 推送(无 iCal 标准字段)。
- attendees 的 PARTSTAT/CN 等参数保真(结构化 attendees 改造,另批)。
- DTSTAMP/SEQUENCE 补齐(现状 iCloud 可用,不动)。
- url/busy/tz 的表单编辑与推送。
- 多值 CATEGORIES 全量保留。
