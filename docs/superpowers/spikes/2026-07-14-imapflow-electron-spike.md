# imapflow-in-Electron 探针报告 (2026-07-14)

## 结论:**GO** ✅

imapflow 能在 Obsidian 桌面端(Electron 渲染进程)用真实 TLS socket 连上 Gmail,并端到端抓取会议邀请的 ICS、用 ical.js 解析成功。纯插件架构成立,**无需**退回"本地中转服务"方案。

## 观测(用户在 `/Users/jiang/claude/workbuddian/demo-vault` 实测)

| 验证点 | 结果 |
|---|---|
| 构建 + 加载(0.1) | ✅ 命令 "Hello (build check)" 弹出 `ogenda loaded ✔` |
| **IMAP TLS 连接 + 打开 INBOX(0.2)** | ✅ "IMAP connect test" 返回 `IMAP OK`(打包后的 `net`/`tls` 在 Electron 渲染进程可用真 socket)——**头号风险的运行期一半通过** |
| 抓取原始 ICS(0.4) | ✅ "Dump one invite ICS" 打出 `RAW ICS: BEGIN:VCALENDAR ...` |
| ical.js 解析(0.4) | ✅ 打出 `Invite parsed: <summary/start/end>` |

## 为让它跑通做的构建调整(Phase 1 直接沿用)

- **esbuild `target`:`es2018` → `es2020`**(关键)。imapflow 的传递依赖 `pino`、`ip-address` 使用 BigInt 字面量(`1_000_000n`),`es2018` 下 esbuild 无法降级、报 "Big integer literals are not available"。Obsidian 桌面端 Electron/Chromium 现代,`es2020` 安全。
- `esbuild.config.mjs`:`platform: "node"`、`format: "cjs"`、`external: ["obsidian", "electron", ...builtins]`(`builtins` 来自 `builtin-modules`)。这套让 Node 内建解析到 Electron 自带 Node、imapflow 与 ical.js 打进 bundle(`main.js` ~1.17MB)。
- imapflow 构造 `logger: false`:运行期不启 pino;注意 esbuild 仍会静态把 pino 打进包(故需上面的 target 调整)。
- `manifest.json` `isDesktopOnly: true`;`minAppVersion: "1.5.0"`。

## 已验证可复用的代码路径(→ Phase 1 连接器演进基础)

- 连接:`new ImapFlow({host:"imap.gmail.com",port:993,secure:true,auth:{user,pass},logger:false})` → `connect()` → `getMailboxLock("INBOX")`。
- 抓取:`client.fetch(range,{uid:true,bodyStructure:true,envelope:true})`;`findCalendarParts(bodyStructure)`(纯函数,已单测)定位 `text/calendar` / `.ics` part;`client.download(uid,part,{uid:true})` → stream→string 得 ICS 原文。
- 解析:`new ICAL.Component(ICAL.parse(ics))` → `getFirstSubcomponent("vevent")` → `new ICAL.Event(vevent)`。

## 决策 → 下一步

- **GO** → 写 `docs/superpowers/plans/2026-07-15-ogenda-phase1-mvp.md`,覆盖 spec 的 Phase 1:AgendaEvent 模型、`ical.js` VEVENT → AgendaEvent 归一化、月度文件解析/序列化(格式1,upsert 保散文)、Gmail IMAP 连接器(由本探针代码演进)、议程列表视图、拉出笔记、safeStorage 密钥、手动/启动同步。

## 探针清理

- [x] 删除测试 vault 内 `.obsidian/plugins/ogenda/data.json`(内含 App 专用密码,plaintext)——凭据不留存。
- 说明:后续若再手测,需在 ogenda 设置页重新填 App 密码;Phase 1 起改用 Electron `safeStorage` 加密存储,不再明文落盘。
