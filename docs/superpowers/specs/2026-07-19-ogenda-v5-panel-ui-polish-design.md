# Ogenda v5-UI Polish — Agenda 面板 6 项交互/视觉修整

- 日期：2026-07-19
- 状态：设计已获用户逐条批准（①A / ④认可固定7色+周末暖色 / ⑥ISO 8601 / ②③⑤默认）
- 范围：纯 Agenda 面板视图层 + 少量 CSS/i18n。**不动** sync 语义、stats 计算层、数据存储。

## 背景

用户在真机使用中提出 6 处面板改进。全部为渲染层微调，无数据模型变更。

---

## 逐条设计

### ① 清单显示日期（方案 A）

**现状**：`views/list-view.ts` 清单是「锚点起 60 天滚动窗口」，按**状态**分组（confirmed/tentative/cancelled/其它/无），每行时间列 `formatTime()` 只显 `14:00–15:00` 或「全天」，跨天时看不出是哪天。

**改动**：保持按状态分组不变；每行时间列改为**两行纵向堆叠**——第一行日期、第二行时间。

- 新增 `date-format.ts` → `formatDayShort(d, lang)`：
  - zh：`7月20日 周一`
  - en：`Mon, Jul 20`
  - 不含年（清单窗口 60 天，跨年是罕见边角，YAGNI 不加年）。
- `list-view.ts`：`formatTime` 保持返回时间串；行首改为一个列容器 `.ogenda-event-when`，内含两行——`.ogenda-event-date`（日期）+ `.ogenda-event-time`（时间，复用现有类）。lang 经 `getLanguage()` 取得（list-view 已 import i18n）。
- 全天事件：第一行日期，第二行「全天」。

**CSS**：新增 `.ogenda-event-when`（`display:flex; flex-direction:column;`，`min-width` 约 6.5em 以容纳 `7月20日 周一`，承接原 `.ogenda-event-time` 的 min-width 职责）；新增 `.ogenda-event-date`（0.72em、`--text-normal`）；既有 `.ogenda-event-time` 保持 0.8em、`--text-muted`、tabular-nums，但**移除其 min-width**（改由 `.ogenda-event-when` 承担）。

### ② 手动同步按钮（默认方案）

**现状**：同步仅靠命令「立即同步日历」触发；`AgendaPanelView` 构造已注入 `triggerSync: () => void` 与 `getSyncProvider: () => string`。

**改动**：`render()` 的 header（`.ogenda-panel-head`）里，在「+新建」按钮旁加一个同步按钮：

- 图标 + 文案：`setIcon(el, "refresh-cw")` + `t("panel.sync")`（zh「同步」/ en「Sync」）。
- 点击 → `this.triggerSync()`。
- 当 `getSyncProvider() === "none"`：按钮加 `.ogenda-disabled`（置灰、`pointer-events:none`），不绑点击。
- 位置：紧邻 `.ogenda-panel-newbtn`（同在 header 右侧）。

**i18n**：新增键 `panel.sync`（zh/en 同步加，键集一致测试守护）。
**CSS**：新增 `.ogenda-panel-syncbtn`（复用 newbtn 的 pill 造型但用中性底色以区分主次）与 `.ogenda-disabled`。

### ③ 迷你日历前移一个月（默认方案）

**现状**：`mini-calendar.ts` `renderMiniCalendar` 从 `anchor` 当月起排 `count` 个月（`monthAnchor = new Date(y, m+i, 1)`），selected 高亮固定落在 `i===0`。面板侧 `miniStart/miniEnd`（事件圆点范围）也从当月 1 号起算。

**改动**：整体前移一个月，让上月排第一格、当前月排第二格。

- `renderMiniCalendar`：起始月 = `anchor.month - shift`，其中 `shift = count >= 2 ? 1 : 0`。
  - **边界**：视口极矮、`count===1` 时不前移（只显当前月），避免「只剩上个月、当前月看不到」。
  - selected 高亮判断改为：`monthAnchor` 的年月 === `anchor` 的年月 → 传 `selected=anchor`，否则 `null`（不再用 `i===0`）。
- `agenda-panel-view.ts` 侧的事件圆点范围同步前移：`miniStart = new Date(y, m - shift, 1)`，`miniEnd = new Date(y, m - shift + monthCount, 1)`，`shift` 同上。

### ④ 周视图星期标题：每天一色 + 加粗 + 字号大些（认可）

**现状**：`views/week-view.ts` 表头 `周一 20`，CSS `.ogenda-week-col-head` 为 0.72em、`--text-muted`。周一起（`startOfWeek` 用 `(getDay()+6)%7`），7 列固定为周一…周日，周末在第 6、7 列。

**改动**：

- 每列表头着色：`head.style.color = WEEK_COLORS[i]`（i=0 周一 … 6 周日）。
- CSS `.ogenda-week-col-head`：字号 0.72em → **0.95em**，`font-weight: 700`，去掉 `--text-muted`（颜色由内联 style 覆盖）。
- `WEEK_COLORS` 常量定义在 `week-view.ts` 顶部（单处使用，就近）。工作日冷/中性、周末暖色：

  | 列 | 星期 | 语义色 | hex |
  |----|------|--------|-----|
  | 0 | 周一 | 蓝 | `#3B82F6` |
  | 1 | 周二 | 绿 | `#22C55E` |
  | 2 | 周三 | 青 | `#06B6D4` |
  | 3 | 周四 | 紫 | `#A855F7` |
  | 4 | 周五 | 灰蓝 | `#64748B` |
  | 5 | 周六 | 琥珀(暖) | `#F59E0B` |
  | 6 | 周日 | 红(暖) | `#EF4444` |

  色值为初稿，均为中等明度、明暗主题下作加粗标题色均可读；实现时如某色在亮/暗主题对比不足可微调，不改变「工作日冷、周末暖」的整体意图。

### ⑤ 月格子增高 30%（默认方案）

**现状**：`.ogenda-month-cell { min-height: 5em }`。

**改动**：`min-height: 5em → 6.5em`（+30%）。仅此一行 CSS。

### ⑥ 周/月顶部标题随 tab 变（ISO 8601）

**现状**：`agenda-panel-view.ts` 的 nav 区 `todayBtn` 恒显 `formatDate(anchor, lang)`（完整单日日期 `2026年7月19日 星期日`）。在周/月 tab 下语义错位。

**改动**：nav 中间标签按 tab 分支：

| tab | 标签内容 | 函数 |
|-----|----------|------|
| day | 单日日期（现状） | `formatDate` |
| list | 单日日期（现状，窗口起点） | `formatDate` |
| week | `2026年第29周` / `Week 29, 2026` | `formatWeek`（新增） |
| month | `2026年7月` / `Jul 2026` | `formatMonth`（已有） |
| stats | 单日日期（现状，不在本次范围） | `formatDate` |

- 「今天·」前缀（`isToday` 判定）**仅在 day/list 保留**；week/month 标签不加「今天·」前缀。
- 点击标签仍回今天（`anchor = safeToday()`）行为不变。

**`formatWeek(d, lang)`（新增 date-format.ts）** 采用 ISO 8601：

- 周一为一周起点；第 1 周 = 含该年第一个周四的那一周。
- 返回的年份是 **ISO week-year**，年初/年末边界可能与日历年差 1（如 12/28–31 若属次年 W01 则显示 `2027年第1周`）——这是 ISO 正确行为，接受。
- 周数不补零。zh：`${isoYear}年第${week}周`；en：`Week ${week}, ${isoYear}`。
- 参考实现（UTC 归一化避免 DST 抖动）：
  ```ts
  function isoWeekParts(d: Date): { year: number; week: number } {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = (t.getUTCDay() + 6) % 7;       // Mon=0..Sun=6
    t.setUTCDate(t.getUTCDate() - dow + 3);    // 移到本周周四
    const isoYear = t.getUTCFullYear();
    const firstThu = new Date(Date.UTC(isoYear, 0, 4));
    const firstDow = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
    const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
    return { year: isoYear, week };
  }
  ```

---

## i18n 新键

| 键 | zh | en |
|----|----|----|
| `panel.sync` | 同步 | Sync |

（`formatDayShort`/`formatWeek` 的「月/日/周」文字沿用 `date-format.ts` 内联分支，与 `formatMonth` 一致，不入 i18n 键表。）

## 测试计划

- `date-format` 单测：
  - `formatDayShort` zh/en 各一例。
  - `formatWeek` ISO 边界：`2026-01-01`(周四)→`2026年第1周`；`2026-07-19`→核对周数；年末跨年例（如 `2024-12-30` 属 `2025-W01`）。
- `mini-calendar` 前移：`count>=2` 时首月=上月且当前月带 selected；`count===1` 时不前移只显当前月。
- 现有 200+ 单测保持绿；新增不破坏 zh/en 键集一致测试。
- 视觉项（④配色、⑤高度、②按钮）自动化测不到 → 真机验收。

## 非目标（YAGNI）

- 不改清单「按状态分组」结构（仅加行内日期）。
- 不动 stats/day 顶部标签（仍单日）、不动 sync 分派与合并语义、不动 stats.ts 计算层。
- 周末不做「非工作日灰化/隐藏」等额外行为，仅表头着色。
- 迷你日历不加「跳转上/下月」按钮，仅调整起始月。
