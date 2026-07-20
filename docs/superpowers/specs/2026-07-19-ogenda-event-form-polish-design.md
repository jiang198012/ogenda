# Ogenda 新建/编辑事件表单优化 — Design

- 日期：2026-07-19
- 状态：设计已获用户逐条批准
- 范围：`EventFormModal`（新建 + 编辑事件表单）的数据约束与填报便捷性。**不动** sync 语义、数据存储、AgendaEvent 模型字段。

## 背景

`EventFormModal` 当前 12 个字段全平铺、校验很薄。本批一次性优化「数据约束」与「填报便捷性」两方面，用户已确认全做。

## 关键前提（一致性）

- 现有列表/日视图的状态中文来自 i18n `status.*`：**已确认 / 待定 / 已取消 / 未设置**（`colors.ts` `statusStyle` 经 `STATUS_LABEL_KEY`）。表单状态下拉当前**硬编码英文** confirmed/tentative/cancelled — 本次中文化即复用这套 `status.*`，保证一处。
- RSVP 目前是硬编码英文「RSVP」+ 自由文本，无 i18n。本次新增 `rsvp.*`。
- 底层存储值不变：状态存 `confirmed/tentative/cancelled`，RSVP 存 iCal PARTSTAT 标准 `NEEDS-ACTION/ACCEPTED/DECLINED/TENTATIVE`。界面显示中文。

---

## A. 数据约束

### A1. 定时事件 `end > start` 校验（补缺口）
现状 `validateEventForm` 只在**全天**分支校验 `end ≤ start`，定时事件完全没校验（可建出结束早于开始的事件）。
- 扩展 `validateEventForm`：非全天且 `end` 非空时，比较完整 datetime，`end ≤ start` → 报错 `validate.timedEnd`。
- 全天分支保持现状（比较日期）。

### A2. 状态下拉中文化
表单状态下拉选项显示改用 `t("status.confirmed")` / `t("status.tentative")` / `t("status.cancelled")` = 已确认 / 待定 / 已取消；空项 `t("form.status.unset")` = (未设置)。值仍存 confirmed/tentative/cancelled。

### A3. RSVP → 「回复状态」下拉
- 字段名 `t("rsvp.name")` = 回复状态 / RSVP。
- 下拉选项（显示中文 → 存英文枚举）：
  - (未设置) → `""`
  - 待答复 → `NEEDS-ACTION`
  - 已接受 → `ACCEPTED`
  - 已拒绝 → `DECLINED`
  - 暂定 → `TENTATIVE`
- **历史值保留**：编辑老事件时若 `rsvp` 非空且不在上述枚举内，额外插入一项 `当前值：<原值>`（value = 原值）并选中，避免下拉「吞掉」旧数据。

### A4. 即时校验
- 每个输入的 `change`（及日期输入的 change）后调用 `updateValidity()`：跑 `validateEventForm` → 错误写入 `errorEl`（实时红字）+ **保存按钮 `disabled`**（有错误时禁用）。
- `onOpen` 末尾调一次 `updateValidity()`（新建时标题空 → 保存按钮初始禁用）。
- `handleSave` 仍在提交前再校验一次（双保险）。

### A5. 邮箱校验 —— 明确不做
organizer/参与者允许是人名，强制邮箱校验会误报。**本批不加邮箱校验**（非目标）。

---

## B. 填报便捷性

### B1. 结束时间默认 +1 小时 + 跟随 start（保持时长）
- 新建**定时**事件：`end` 初始 = `start + 1 小时`（`start` 默认 09:00 → `end` 10:00）。新建全天：`end` 留空。
- **跟随**：用户修改 `start` 时，若 `end` 非空，`end` 平移保持时长 —— `newEnd = newStart + (oldEnd − oldStart)`。对定时保持「时长」、对全天保持「天数」。
- 抽纯函数 `shiftEndWithStart(oldStart, oldEnd, newStart): string`（可单测）：`end` 空或解析失败时返回原 `end`（不跟随）。
- 追踪 `oldStart`：start input `change` 时，用 change 前的 `this.fields.start` 作 oldStart，读新值作 newStart，算 newEnd 写回 end input，再更新 `this.fields.start/end`。
- 切换全天开关不触发跟随（仅做格式转换，保留值，现状逻辑）。

### B2. 高级字段折叠
- **常显**：标题、全天、开始、结束、地点、分类、标签。
- **折叠**（默认收起，点击「▸ 更多选项」`t("form.moreOptions")` 展开）：组织者、参与者、状态、回复状态。
- 折叠区放进一个容器 div（默认 `display:none`），一个可点的展开行切换显示。
- **编辑事件的默认展开**：若折叠区任一字段（organizer/attendees/status/rsvp）有值，打开表单时默认展开（避免已有数据被藏起来）；否则收起。

### B3. 分类合并为一个输入
- 现在「选已有下拉」+「新建文本」两个字段（`categoryDropdown` + `categoryText`）合成**一个** `category` 文本输入 + `<datalist>`（列出 `existingCategories` 作候选）：可选已有、也可直接输入新分类。
- `RawFormFields`：去掉 `categoryDropdown`/`categoryText`，改单个 `category: string`。
- `buildEventFromFields`：`category = fields.category.trim() || undefined`。
- 移除 `form.newCategory.*` 键；`form.category.desc` 改为「选择已有或输入新分类」。

### B4. 自动聚焦标题 + Enter 保存
- `onOpen` 末尾 `titleInput.focus()`。
- Modal 级 `keydown`：`Enter` 且非 IME 组合（`!e.isComposing`）且保存按钮未禁用 → `handleSave()`。（表单无多行输入，Enter 不与换行冲突。）

### B5. 字段重排
顺序：标题 `*` → 全天 → 开始 `*` → 结束 → 地点 → 分类 → 标签 →（折叠）组织者 → 参与者 → 状态 → 回复状态。

### B6. 必填 `*` 标记
标题、开始的 Setting 名后加 ` *`（配合 A4 即时校验）。

---

## i18n 变更

新增（zh / en，两表键集一致）：
| 键 | zh | en |
|----|----|----|
| `validate.timedEnd` | 结束时间需晚于开始时间 | End time must be after start time |
| `form.moreOptions` | 更多选项 | More options |
| `rsvp.name` | 回复状态 | RSVP |
| `rsvp.needsAction` | 待答复 | Needs action |
| `rsvp.accepted` | 已接受 | Accepted |
| `rsvp.declined` | 已拒绝 | Declined |
| `rsvp.tentative` | 暂定 | Tentative |
| `rsvp.currentValue` | 当前值：{value} | Current: {value} |

修改：`form.category.desc` → 「选择已有或输入新分类」/「Pick an existing one or type a new one」。
移除：`form.newCategory.name`、`form.newCategory.desc`（分类合并后不再使用）。
复用（不新增）：状态下拉用 `status.confirmed/tentative/cancelled`、空项用 `form.status.unset`。RSVP 历史值保留项（A3）用上表新增的 `rsvp.currentValue`（带 `{value}` 插值）。

---

## 文件影响

- `src/agenda-panel/event-form-fields.ts`（纯逻辑，**可单测**）：
  - `RawFormFields` 去 `categoryDropdown`/`categoryText` → 加 `category`；`rsvp` 保持 string（存枚举）。
  - `validateEventForm` 扩展定时 end 校验。
  - `buildEventFromFields` 分类合并、rsvp 直取。
  - 新增 `shiftEndWithStart(oldStart, oldEnd, newStart)`。
  - 新增 RSVP 选项常量（value+labelKey 列表）供 modal 与测试共用。
- `src/agenda-panel/event-form-modal.ts`（import obsidian，**不可单测**，靠 build + 真机）：字段重排、折叠容器、分类 datalist、status/rsvp 下拉中文、即时校验、聚焦、Enter、end 跟随监听、必填标记。
- `src/i18n/zh.ts` / `src/i18n/en.ts`：上表增删改（键集一致，`i18n.test.ts` 守护）。
- `tests/agenda-panel/event-form-fields.test.ts`：更新（分类合并、rsvp、定时 end 校验）+ 新增 `shiftEndWithStart` 测试。

## 测试计划

- `validateEventForm`：定时 `end ≤ start` 报错、`end > start` 通过、全天分支不回归、end 空通过。
- `shiftEndWithStart`：定时保持时长（09:00–10:00，start 改 14:00 → end 15:00）；全天保持天数；end 空 → 返回空；跨天时长保持。
- `buildEventFromFields`：单 `category` 字段生效；rsvp 枚举原样存；清空字段仍 undefined。
- RSVP/status 选项常量与 i18n 键对应。
- 即时校验、折叠、聚焦、Enter、datalist、end 跟随的 DOM 联动：`event-form-modal.ts` 不可单测（obsidian 依赖）→ build 干净 + 真机验收。
- i18n zh/en 键集一致（现有 parity 测试）。

## 非目标（YAGNI）

- 邮箱格式校验（A5，去掉）。
- `rrule`/`url`/`tz` 的表单编辑（新建重复事件属另一批功能）。
- 参与者/标签的 chip 输入（保持逗号分隔文本 + 提示）。
- 改 AgendaEvent 模型、sync 合并语义、存储格式。
