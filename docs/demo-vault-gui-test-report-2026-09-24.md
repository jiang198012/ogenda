# Ogenda `demo-vault` 全量功能测试报告

**测试日期**：2026-09-24
**被测版本**：Ogenda 1.3.6（`77dfe53`）
**运行环境**：Obsidian 1.13.7，macOS，`/Users/jiang/claude/workbuddian/demo-vault`
**方式**：Computer Use 实际操作 + Vault 文件复核 + 当前仓库自动化测试

## 结论先行

### 2026-09-24 Computer Use 补验收

本次补做使用真实 Obsidian 1.13.7 窗口打开 `/Users/jiang/claude/workbuddian/demo-vault`，完成了三次退出/启动循环。第三次启动后窗口标题仍为 `2026-08 - demo-vault - Obsidian 1.13.7`，Agenda 面板恢复，启动同步提示“双向同步完成”。

- 新建事件真实通过：输入 `YYYY-MM-DD` 日期、时间、标题、备注并保存；列表实际出现 `09:05–09:20 CUA验收-日期输入-20260924`。
- 日期控件已确认是单一可编辑文本框：辅助功能树显示 `Description: 开始日期(YYYY-MM-DD), Placeholder: YYYY-MM-DD`，不再是旧的 Month/Day/Year 分段控件。
- 日视图真实显示事件卡片；周视图真实显示周一至周日 7 个日期列，当前窄面板截图可见 3 个泳道，事件卡片标题可见两行。
- 月视图真实打开并显示 2026 年 9 月网格；列表/日/周/月四个入口已直接操作。
- 测试事件与临时 `Agenda/2026-09.md` 已清理；`data.json`、`.ogenda-sync-state.json` 与事前备份逐字节一致。

未计为 PASS 的项：统计页由于 Computer Use 坐标注入返回 `noWindowsAvailable`，且五个 tab 在无障碍树中被合并为一段文本，未能稳定点到“统计”；真实设备触控指针未接入；没有重新输入或修改云端凭据（但启动后的既有凭据双向同步成功）。

本轮已建立并逐项登记测试方案中的 **123/123 条用例**，没有漏掉功能类别；但不能把所有用例标成通过：

- 直接 Computer Use 已看到 Ogenda 面板、五个视图入口、同步状态、新建事件表单、必填校验、全天开关、地点/分类/备注等字段。
- 当前仓库现场复核：`npm test` **50 个测试文件、527 个测试通过**；`npm run build` 通过。
- 当前 `demo-vault` 测试前后 `Agenda/` 7 个文件逐字节一致，`data.json` SHA-1 一致；没有留下测试事件或设置污染。
- 没有确认新的产品逻辑缺陷。剩余未通过项主要是 Computer Use 的统计页坐标注入、触控设备未接入，以及 iCloud 日历发现/外部凭据边界；日期文本输入本轮已真实通过。

因此，本报告的状态是“全量覆盖登记 + 证据分级”，不是“123 条全部 PASS”。

## 直接 Computer Use 证据

1. Agenda 面板：实际看到 `清单 / 日 / 周 / 月 / 统计` 五个入口、`今天`日期导航、`+ 新建`和“同步完成”状态；列表、日、周、月已直接操作。
2. 新建事件表单：真实填写标题、全天开关、开始/结束日期时间、地点/分类/备注字段；`YYYY-MM-DD` 文本框可写入并保存，事件实际出现在列表和日/周视图。
3. 重启验证：连续三次退出/启动 Obsidian；第三次窗口标题为 `2026-08 - demo-vault - Obsidian 1.13.7`，Agenda 面板和启动同步恢复。
4. 测试数据清理：测试事件和临时月份文件已删除；`data.json` 与 `.ogenda-sync-state.json` 和事前备份一致。

## 123 条用例逐项状态索引

状态含义：`PASS(CUA)`=本轮 Computer Use 直接看到；`PASS(AUTO)`=本轮自动化测试覆盖；`PASS(HIST)`=此前 1.3.5 Computer Use 报告已验证、作为补充证据但不是本轮直接复测；`PARTIAL`=只验证了部分前置行为；`BLOCKED`=本轮已到达/尝试，但工具、外部凭据或安全边界阻止完整断言。

| 套件 | 用例 | 状态与证据 |
|---|---|---|
| T1 加载与命令 | T1.1–T1.4 | PASS(CUA)：插件加载、ribbon、命令面板和 Agenda 面板入口可见 |
|  | T1.5 | PARTIAL：重启后 demo-vault 和插件恢复；面板激活页未能稳定复核 |
|  | T1.6 | BLOCKED：本地 1.3.6 已核对；GitHub/Harness 远端 tag 当前网络/认证不可读 |
| T2 导航 | T2.1 | PASS(CUA)：列表、日、周、月真实切换；统计页因坐标注入/无障碍合并阻塞 |
|  | T2.2–T2.9 | PASS(HIST)，本轮复点 BLOCKED(CUA) |
| T3 事件 CRUD | T3.1 | PASS(CUA)：真实输入日期/时间、保存，列表与日/周视图出现事件，随后清理 |
|  | T3.2–T3.7 | PASS(HIST)：编辑、标题修改、删除确认/取消、在笔记中查看 |
|  | T3.8–T3.10 | BLOCKED(CUA)：月格空白新建、同日 5 事件和 UID 往返未能在当前窗口完成 |
| T4 表单 | T4.1–T4.3 | PASS(CUA)：标题焦点、标题/开始时间必填校验和禁用保存可见 |
|  | T4.4–T4.16 | PASS(HIST)+PASS(AUTO)：全天、结束时间、分类、更多选项、参与人和提醒字段有证据 |
|  | T4.17–T4.21 | PASS(AUTO)：Enter/IME/textarea/状态与 RSVP 逻辑有专门测试 |
| T5 视图渲染 | T5.1–T5.4 | PASS(CUA)：清单、日、周、月真实显示；周视图 AX 树含周一至周日 7 列，窄面板截图可见 3 泳道 |
|  | T5.5–T5.10 | PASS(AUTO)+PASS(HIST)：统计、跨午夜、多天全天、RRULE；统计页本轮未计手工 PASS |
| T6 月视图布局 | T6.1–T6.6 | PASS(AUTO/源码)：布局约束与换行规则存在；BLOCKED(CUA)：当前无法拖动面板做宽窄实测 |
| T7 设置 | T7.1–T7.11 | PASS(HIST)：中英文、默认分类、同步方式、文件夹、时区、启动同步和持久化 |
| T8 密码显隐 | T8.1–T8.5 | BLOCKED(CUA)：当前无法重新进入设置页；源码存在 iCloud/CalDAV 显隐入口，未以 UI 断言替代 |
| T9 日历发现 | T9.1–T9.13 | BLOCKED(EXTERNAL)：未把真实 App 专用密码重新提交到外部服务；发现过滤逻辑有源码/自动化证据，UI 结果未冒充 PASS |
| T10 同步 | T10.1–T10.2 | BLOCKED(CUA)：未能在当前设置页切换到关闭/不完整配置 |
|  | T10.3 | PASS(CUA)：本轮实际触发同步，Notice 返回“拉取 0、认领 0、推送 0、新建 0、冲突 0、删除 0、服务器已删 25（无变化）” |
|  | T10.4–T10.9 | PASS(AUTO)+PASS(HIST)：双向新建/修改/删除、服务器变更、冲突策略 |
|  | T10.10–T10.13 | PASS(AUTO)；BLOCKED(CUA)：VTODO、ICS、CalDAV UI 切换未重新操作 |
|  | T10.14–T10.16 | PASS(AUTO)：重复点击节流、中文编码、全天事件 DTSTART/DTEND |
| T11 国际化 | T11.1–T11.6 | PASS(HIST)+PASS(AUTO)：中英文界面、日期/周标签、分类和已存事件值 |
| T12 边界异常 | T12.1–T12.3 | PASS(AUTO)：非法 JSON、类型清洗、异常 Markdown 的解析保护 |
|  | T12.4–T12.7 | PASS(AUTO)+PASS(HIST)：目录重建、特殊字符、200+数据模型、时区/DST |
|  | T12.8–T12.10 | BLOCKED(CUA)：面板极限拖拽、双面板和完整控制台收集未能在本轮完成 |

## 当前自动化与文件证据

```text
npm test       50 passed files / 527 passed tests
npm run build  exit 0
version        package.json = 1.3.6, manifest.json = 1.3.6
vault diff     临时事件和 2026-09.md 已清理；data.json、.ogenda-sync-state.json 与事前备份一致
```

源码中还确认了当前版本的窄周视图断点和触控处理：`<=360px` 单泳道、`361–720px` 三泳道、`>720px` 七泳道；事件块支持鼠标/触控长按移动、底部拖动调整时长。由于本轮 CUA 无法稳定控制窗口尺寸和触控指针，这些只计入自动化/源码证据，不计为手工 PASS。

## 阻塞与改进意见

1. **Computer Use 兼容性**：Obsidian 重启后窗口截图可见，但无障碍树只返回空容器；坐标点击返回 `noWindowsAvailable`。建议下一轮用带远程调试端口的 Obsidian 实例重跑，以取得可复现的点击、输入、截图和控制台证据。
2. **统计页可访问性**：五个 tab 在无障碍树中被合并为一段文本，坐标点击返回 `noWindowsAvailable`；建议为每个 tab 增加独立按钮语义和稳定 `aria-label`，便于真实窄屏/辅助技术验收。
3. **外部同步测试隔离**：日历发现和双向写入应使用专用测试日历/可回滚账号；本轮不把真实 iCloud 写入或删除当作“全量通过”。
4. **发布门槛**：当前没有本轮确认的 P0/P1 产品缺陷，但在统计页 CUA、真实设备触控和专用外部账号验收完成前，不建议把“全量手工验收通过”写入发布结论。

## 清理结果

测试完成后已删除测试事件和仅由本次验收产生的 `Agenda/2026-09.md`；`data.json`、`.ogenda-sync-state.json` 与事前备份逐字节一致。没有遗留测试数据。
