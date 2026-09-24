# Ogenda `demo-vault` 手工验收运行手册

这份手册把 Obsidian 的启动参数、CDP 入口、窗口边界和恢复动作固定下来。它只针对本机测试 vault，不使用生产 vault，也不要求把 iCloud/CalDAV 凭据写入仓库。

## 1. 准备与启动

先确认测试 vault 存在，并在需要修改 vault 内容前做一次可识别的备份：

```bash
VAULT=/Users/jiang/claude/workbuddian/demo-vault
BACKUP=/tmp/ogenda-demo-vault-manual-$(date +%Y%m%d-%H%M%S)
ditto "$VAULT" "$BACKUP"
```

先用 dry-run 检查真实启动计划：

```bash
node scripts/manual-test/launch-demo-vault.mjs \
  --vault "$VAULT" --port 9333 --width 1280 --height 900 --dry-run
```

确认输出中的 vault、CDP 地址、窗口尺寸和 Obsidian 可执行文件后，再启动：

```bash
node scripts/manual-test/launch-demo-vault.mjs \
  --vault "$VAULT" --port 9333 --width 1280 --height 900
```

也可以用 `OGENDA_DEMO_VAULT`、`OGENDA_CDP_PORT`、`OGENDA_WINDOW_WIDTH`、`OGENDA_WINDOW_HEIGHT` 和 `OGENDA_OBSIDIAN_BIN` 覆盖默认值。启动脚本遇到不存在的 vault、非法端口/尺寸或缺少 Obsidian 二进制文件时会返回非零状态，不会静默跳过。

## 2. CDP、截图和控制台

启动后先验证 CDP 页面列表：

```bash
curl -fsS http://127.0.0.1:9333/json
```

用现有的 CDP evaluator 做只读探针；它会优先选择标题包含 `demo-vault` 的页面：

```bash
OGENDA_CDP_PORT=9333 node scripts/cdp-eval.mjs \
  "({title: document.title, width: innerWidth, height: innerHeight, errors: [...document.querySelectorAll('.notice')].map(x => x.textContent)})"
```

控制台零错误必须在 DevTools Console 中实际观察并记录；CDP 脚本返回成功不能代替截图或控制台证据。每个断点至少保存一张截图，文件名包含宽度，例如 `week-390.png`。

## 3. 窄屏周视图矩阵

先打印本轮矩阵：

```bash
node scripts/manual-test/viewport-matrix.mjs
```

| 容器宽度 | 预期泳道 | 必查项目 |
|---:|---:|---|
| 360px | 1 | 选日条、事件卡两行、无横向溢出 |
| 361px | 3 | 三泳道切换稳定、卡片两行 |
| 390px | 3 | 一般手机默认三泳道、可点按 |
| 720px | 3 | 三泳道上边界、列不跳变 |
| 721px | 7 | 桌面七泳道、标题不遮挡 |

每个宽度同时确认：周视图小时高度与日视图一致；事件标题显示两行；空白点按能新建；触控长按能移动事件；底部拖动能调整时长。触控失败要记录设备/浏览器真实错误，不能用鼠标 PASS 代替。

## 4. 日期控件验收

在新建定时、全天、编辑开始日期和结束日期校验四条路径中，优先使用带 `data-testid` 的单值文本框输入 `YYYY-MM-DD`，再用日历按钮验证原生选择器仍可用。非法日期应保留可见输入并阻止保存；合法日期保存后检查 Markdown 中的日期/时间。

## 5. provider fixture 验收

provider 测试只使用仓库内的本地内存 HTTP fixture：

```bash
npx vitest run tests/connectors/caldav/caldav-fixture.test.ts tests/sync/provider-fixture.test.ts
```

矩阵必须覆盖关闭、iCloud 配置解析、通用 CalDAV、ICS 只读、VEVENT 发现、VTODO/订阅/Inbox/Outbox 过滤，以及本地 CRUD、ETag 冲突和网络失败。测试请求只能指向 `127.0.0.1`，不得填入或打印真实账户密码。

## 6. 清理与恢复

停止 Obsidian 后，若本轮确实改变了测试 vault，先核对备份路径，再按需恢复：

```bash
ditto "$BACKUP" "$VAULT"
```

恢复完成后重新打开 vault，确认 `data.json`、Agenda 月度文件和插件版本回到测试前状态。若没有写入，不要执行恢复覆盖；在报告中明确写“未修改 vault”。

## 7. 记录格式

每条用例记录 `PASS`、`FAIL` 或 `BLOCKED`，附窗口宽度/设备、截图路径、控制台错误和真实命令输出。`BLOCKED` 只表示工具、凭据或外部服务前置条件缺失，不能推断为产品缺陷；可重复的业务错误才另外建 issue。
