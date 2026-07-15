# ogenda Phase 0 探针 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 证明一个用 esbuild 打包的 Obsidian 桌面插件能用 `imapflow` 经 App 密码连上 Gmail、打开 INBOX、找到会议邀请、把原始 ICS 打到控制台并用 `ical.js` 解析——即验证"IMAP-in-Electron"这条整个项目最大的架构风险。

**Architecture:** 最小 Obsidian 插件(`Plugin` 子类 + 三个命令),核心逻辑拆成聚焦小模块:纯函数 `findCalendarParts`(可单测)、`imap-spike`(网络,手动集成测)、`spike-settings`(临时凭据)。这是**一次性验证件**,不是 MVP 代码——通过后据结果再写 Phase 1 详细计划。

**Tech Stack:** TypeScript · esbuild · `builtin-modules` · `imapflow` · `ical.js` · Obsidian API · vitest

## Global Constraints

- 平台桌面端 only:`manifest.json` 必须 `isDesktopOnly: true`;`minAppVersion: "1.5.0"`。
- 运行环境:Node v22.22.2 / npm 10.9.7(已确认可用)。
- Gmail 前提:账户已开两步验证并生成 16 位 **App 专用密码**;IMAP 主机固定 `imap.gmail.com:993`,`secure: true`。
- imapflow 构造必须 `logger: false`(避免 pino 打包问题)。
- esbuild 必须把所有 Node 内建模块(`...builtins`,来自 `builtin-modules`)+ `obsidian` + `electron` 标为 `external`;否则 `net`/`tls` 被打包/polyfill,imapflow 无法用真实 socket。
- 密钥仅存在**测试 vault 的 `.obsidian/plugins/ogenda/data.json`**(该文件在测试 vault 里、不属于本仓库,天然不进本仓库 git);**探针结束即删除凭据**。真正的 safeStorage 加密留给 Phase 1。
- `VAULT_PATH`(执行前必须设定):本机 Obsidian demo vault 的绝对路径。执行第一步先向用户确认;若无则用 Obsidian 内置 Sandbox vault 或新建一个空 vault。本计划中凡出现 `$VAULT_PATH` 均指该路径。

---

### Task 0.1: 脚手架 + esbuild 构建,证明插件能在 demo vault 里加载

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `versions.json`, `.gitignore`, `src/main.ts`

**Interfaces:**
- Produces: `OgendaPlugin`(default export,`extends Plugin`);构建产物 `main.js`(仓库根)。

- [ ] **Step 1: 确认 `VAULT_PATH`**

向用户确认本机 Obsidian demo vault 绝对路径,记为 `$VAULT_PATH`。例如 `/Users/jiang/Documents/DemoVault`。后续步骤都用它。

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "ogenda",
  "version": "0.0.1",
  "description": "Obsidian desktop agenda plugin — sync schedule events from mailbox accounts",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run"
  },
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^22",
    "builtin-modules": "^4",
    "esbuild": "^0.24",
    "obsidian": "latest",
    "tslib": "^2",
    "typescript": "^5",
    "vitest": "^2"
  },
  "dependencies": {
    "imapflow": "^1",
    "ical.js": "^2"
  }
}
```

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "target": "ES2018",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["DOM", "ES2018", "ES2020"],
    "types": ["node"],
    "allowJs": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "importHelpers": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: 写 `esbuild.config.mjs`(external 是关键)**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2018",
  external: ["obsidian", "electron", ...builtins],
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  logLevel: "info",
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

- [ ] **Step 5: 写 `manifest.json` 和 `versions.json`**

`manifest.json`:
```json
{
  "id": "ogenda",
  "name": "ogenda",
  "version": "0.0.1",
  "minAppVersion": "1.5.0",
  "description": "Sync schedule events from mailbox accounts into your vault, with an agenda view.",
  "author": "jiang",
  "isDesktopOnly": true
}
```
`versions.json`:
```json
{ "0.0.1": "1.5.0" }
```

- [ ] **Step 6: 写 `.gitignore`**

```gitignore
node_modules/
main.js
main.js.map
*.log
.spike-*
```

- [ ] **Step 7: 写 `src/main.ts`(骨架,只有一个 Notice 命令)**

```ts
import { Plugin, Notice } from "obsidian";

export default class OgendaPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "ogenda-hello",
      name: "Hello (build check)",
      callback: () => new Notice("ogenda loaded ✔"),
    });
  }
}
```

- [ ] **Step 8: 安装依赖并构建**

Run:
```bash
npm install
npm run dev
```
Expected: `npm run dev` 进入 watch,esbuild 打印 `build finished`,仓库根生成 `main.js`(无 error)。让它常驻;后续改代码自动重建。

- [ ] **Step 9: 链接进测试 vault 并启用**

Run(另开一个终端):
```bash
mkdir -p "$VAULT_PATH/.obsidian/plugins/ogenda"
ln -sf /Users/jiang/claude/ogenda/main.js      "$VAULT_PATH/.obsidian/plugins/ogenda/main.js"
ln -sf /Users/jiang/claude/ogenda/manifest.json "$VAULT_PATH/.obsidian/plugins/ogenda/manifest.json"
```
然后在 Obsidian 打开该 vault → Settings → Community plugins → 关闭 Restricted mode → 启用 "ogenda"。

- [ ] **Step 10: 手动验证加载(集成测)**

在 Obsidian 里 `Cmd+P` → 运行 "ogenda: Hello (build check)"。
Expected: 右上角弹出 Notice `ogenda loaded ✔`。**这证明构建+加载管线通了,再上 imapflow。**

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore(spike): scaffold obsidian plugin + esbuild build"
```

---

### Task 0.2: 加 imapflow,证明 TLS 连接 + 打开 INBOX(头号风险)

**Files:**
- Create: `src/spike-settings.ts`, `src/imap-spike.ts`
- Modify: `src/main.ts`(加设置页 + 连接测试命令)

**Interfaces:**
- Produces: `interface SpikeSettings { email: string; appPassword: string }`;`DEFAULT_SETTINGS: SpikeSettings`;`class SpikeSettingTab`;`async function imapConnectTest(s: SpikeSettings): Promise<void>`。
- Consumes: 0.1 的 `OgendaPlugin`。

- [ ] **Step 1: 写 `src/spike-settings.ts`(临时凭据输入)**

```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "./main";

export interface SpikeSettings {
  email: string;
  appPassword: string;
}

export const DEFAULT_SETTINGS: SpikeSettings = { email: "", appPassword: "" };

export class SpikeSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ogenda spike (throwaway creds — 探针结束后删除)" });
    new Setting(containerEl).setName("Gmail address").addText((t) =>
      t.setValue(this.plugin.settings.email).onChange(async (v) => {
        this.plugin.settings.email = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("App password (16 chars)").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.plugin.settings.appPassword).onChange(async (v) => {
        this.plugin.settings.appPassword = v.trim();
        await this.plugin.saveSettings();
      });
    });
  }
}
```

- [ ] **Step 2: 写 `src/imap-spike.ts`(先只放连接测试)**

```ts
import { ImapFlow } from "imapflow";
import { Notice } from "obsidian";
import type { SpikeSettings } from "./spike-settings";

export function makeClient(s: SpikeSettings): ImapFlow {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: s.email, pass: s.appPassword },
    logger: false,
  });
}

export async function imapConnectTest(s: SpikeSettings): Promise<void> {
  const client = makeClient(s);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const n = client.mailbox.exists;
      console.log("[ogenda] INBOX exists:", n);
      new Notice(`IMAP OK: INBOX has ${n} messages`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error("[ogenda] IMAP connect failed:", e);
    new Notice("IMAP connect FAILED: " + (e as Error).message);
  }
}
```

- [ ] **Step 3: 改 `src/main.ts`(接入设置 + 连接命令)**

替换整个文件:
```ts
import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, SpikeSettings, SpikeSettingTab } from "./spike-settings";
import { imapConnectTest } from "./imap-spike";

export default class OgendaPlugin extends Plugin {
  settings: SpikeSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SpikeSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-hello",
      name: "Hello (build check)",
      callback: () => new Notice("ogenda loaded ✔"),
    });
    this.addCommand({
      id: "ogenda-imap-connect-test",
      name: "IMAP connect test",
      callback: () => void imapConnectTest(this.settings),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 4: 构建检查**

`npm run dev` 应已在 watch。观察终端:esbuild 重建**无 error**(尤其没有关于 `net`/`tls`/`fs` 的解析报错)。
Expected: `build finished`,`main.js` 更新。**若此处报 Node 内建模块相关错误 → external 配置有问题,先修 `esbuild.config.mjs`。**

- [ ] **Step 5: 填凭据**

在 Obsidian 里 reload 插件(Community plugins 里 disable/enable 一次),打开 ogenda 设置页,填入 Gmail 地址 + 16 位 App 专用密码。

- [ ] **Step 6: 手动验证连接(集成测 · 头号风险验证点)**

`Cmd+P` → 运行 "ogenda: IMAP connect test"。打开开发者控制台(`Cmd+Opt+I`)看日志。
Expected(**GO 信号**):Notice `IMAP OK: INBOX has N messages`,控制台打印 `[ogenda] INBOX exists: N`。
若失败(**NO-GO 信号**):记录控制台完整报错。若是 `net.connect is not a function` / `require('tls')` 之类打包/解析错误 → 调 `esbuild.config.mjs`(确认 `...builtins` 生效、试 `platform` 取值)后重试;若认证错(`AUTHENTICATIONFAILED`)→ 是凭据/2FA 问题,非架构问题;若彻底连不通 → 记入 spike 报告,评估退回中转服务方案。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(spike): imapflow TLS connect + INBOX open test"
```

---

### Task 0.3: 纯函数 `findCalendarParts` + 单测(找出邀请所在的 MIME part)

**Files:**
- Create: `src/find-calendar-parts.ts`, `tests/find-calendar-parts.test.ts`

**Interfaces:**
- Produces: `interface BodyNode`;`function findCalendarParts(node: BodyNode | undefined): string[]`(返回 `text/calendar` 或 `.ics` 附件所在的 part id 列表)。
- Consumes:无(纯逻辑)。

- [ ] **Step 1: 写失败测试 `tests/find-calendar-parts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { findCalendarParts } from "../src/find-calendar-parts";

const sample = {
  type: "multipart/mixed",
  childNodes: [
    { part: "1", type: "text/plain" },
    { part: "2", type: "text/calendar", parameters: { method: "REQUEST" } },
    {
      part: "3",
      type: "application/octet-stream",
      disposition: "attachment",
      dispositionParameters: { filename: "invite.ics" },
    },
  ],
};

describe("findCalendarParts", () => {
  it("finds text/calendar and .ics attachment parts", () => {
    expect(findCalendarParts(sample)).toEqual(["2", "3"]);
  });
  it("returns empty when no calendar parts", () => {
    expect(findCalendarParts({ type: "text/plain", part: "1" })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/find-calendar-parts.test.ts`
Expected: FAIL —— 无法解析 `../src/find-calendar-parts`(模块不存在)。

- [ ] **Step 3: 写实现 `src/find-calendar-parts.ts`**

```ts
export interface BodyNode {
  part?: string;
  type?: string;
  disposition?: string;
  dispositionParameters?: { filename?: string };
  parameters?: Record<string, string>;
  childNodes?: BodyNode[];
}

export function findCalendarParts(node: BodyNode | undefined): string[] {
  const out: string[] = [];
  const walk = (n?: BodyNode) => {
    if (!n) return;
    const type = String(n.type || "").toLowerCase();
    const filename = String(n.dispositionParameters?.filename || "").toLowerCase();
    const isCalendar =
      type.includes("calendar") || type === "application/ics" || filename.endsWith(".ics");
    if (isCalendar && n.part) out.push(n.part);
    n.childNodes?.forEach(walk);
  };
  walk(node);
  return out;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npx vitest run tests/find-calendar-parts.test.ts`
Expected: PASS(2 passed)。

- [ ] **Step 5: Commit**

```bash
git add src/find-calendar-parts.ts tests/find-calendar-parts.test.ts
git commit -m "feat(spike): findCalendarParts pure fn + unit test"
```

---

### Task 0.4: 端到端抓取一封真邀请的 ICS + ical.js 解析

**Files:**
- Modify: `src/imap-spike.ts`(加 `dumpOneInvite`)、`src/main.ts`(加命令)

**Interfaces:**
- Produces: `async function dumpOneInvite(s: SpikeSettings): Promise<void>`。
- Consumes: 0.2 `makeClient`、0.3 `findCalendarParts`。

- [ ] **Step 1: 在 `src/imap-spike.ts` 末尾追加 import 与函数**

在文件顶部 import 区补:
```ts
import ICAL from "ical.js";
import { findCalendarParts } from "./find-calendar-parts";
```
在文件末尾追加:
```ts
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf-8");
}

export async function dumpOneInvite(s: SpikeSettings): Promise<void> {
  const client = makeClient(s);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox.exists;
      const start = Math.max(1, total - 49); // 最近 ~50 封
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        bodyStructure: true,
        envelope: true,
      })) {
        const parts = findCalendarParts(msg.bodyStructure as any);
        if (parts.length === 0) continue;
        console.log("[ogenda] invite subject:", msg.envelope?.subject, "parts:", parts);
        const dl = await client.download(msg.uid, parts[0], { uid: true });
        const ics = await streamToString(dl.content);
        console.log("[ogenda] RAW ICS:\n" + ics);
        try {
          const comp = new ICAL.Component(ICAL.parse(ics));
          const vevent = comp.getFirstSubcomponent("vevent");
          if (vevent) {
            const ev = new ICAL.Event(vevent);
            console.log("[ogenda] parsed:", ev.summary, String(ev.startDate), String(ev.endDate));
            new Notice(`Invite parsed: ${ev.summary}`);
          }
        } catch (pe) {
          console.error("[ogenda] ical parse failed:", pe);
        }
        await client.logout();
        return;
      }
      new Notice("No calendar invite found in last 50 messages");
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error("[ogenda] dump failed:", e);
    new Notice("dump failed: " + (e as Error).message);
  }
}
```

- [ ] **Step 2: 改 `src/main.ts`(注册 dump 命令,最终版)**

替换整个文件:
```ts
import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, SpikeSettings, SpikeSettingTab } from "./spike-settings";
import { imapConnectTest, dumpOneInvite } from "./imap-spike";

export default class OgendaPlugin extends Plugin {
  settings: SpikeSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SpikeSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-hello",
      name: "Hello (build check)",
      callback: () => new Notice("ogenda loaded ✔"),
    });
    this.addCommand({
      id: "ogenda-imap-connect-test",
      name: "IMAP connect test",
      callback: () => void imapConnectTest(this.settings),
    });
    this.addCommand({
      id: "ogenda-dump-invite",
      name: "Dump one invite ICS",
      callback: () => void dumpOneInvite(this.settings),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 3: 构建检查**

观察 `npm run dev` 终端:重建无 error(尤其 `ical.js` 能正常打进 bundle)。
Expected: `build finished`。

- [ ] **Step 4: 准备一封真邀请**

用另一账户或 Google Calendar 给该 Gmail 发一个日历邀请(或转发一封含 `.ics` 的邀请),确保它在 INBOX 最近 50 封内。

- [ ] **Step 5: 手动端到端验证(通过标准)**

Obsidian reload 插件 → `Cmd+P` → "ogenda: Dump one invite ICS" → 看开发者控制台。
Expected(**GO 信号,探针成功**):控制台打印 `[ogenda] RAW ICS:` 后跟完整 `BEGIN:VCALENDAR ... END:VCALENDAR`,并打印 `[ogenda] parsed: <标题> <开始> <结束>`,Notice 显示 `Invite parsed: ...`。
若拿到原始 ICS 但 `ical parse failed` → imapflow 通过、ical.js 需调整(记入报告,非致命)。

- [ ] **Step 6: Commit**

```bash
git add src/imap-spike.ts src/main.ts
git commit -m "feat(spike): end-to-end dump invite ICS + ical.js parse"
```

---

### Task 0.5: 记录探针结论 + 决策门禁

**Files:**
- Create: `docs/superpowers/spikes/2026-07-14-imapflow-electron-spike.md`

- [ ] **Step 1: 写探针报告**

按实际结果填写(下面是模板,把 `<...>` 换成真实观测):
```markdown
# imapflow-in-Electron 探针报告 (2026-07-14)

## 结论:GO / NO-GO —— <填>

## 观测
- 构建加载(0.1):<成功/失败 + 现象>
- IMAP TLS 连接 + INBOX(0.2):<INBOX exists=N / 报错原文>
- 抓取原始 ICS(0.4):<成功 + 摘要 / 报错原文>
- ical.js 解析(0.4):<summary/start/end / 报错原文>

## 为让它跑通做的构建调整
- esbuild `platform` 最终取值:<node/browser>
- external / 其他改动:<...>
- imapflow 选项:logger:false <是否够,还是需别的>

## 决策
- GO → 据本报告写 Phase 1(MVP)详细计划,复用已验证的连接/抓取/解析路径。
- NO-GO → imapflow 无法在 Obsidian 渲染进程用真 socket;改走"本地中转服务"架构,回到 spec §2/§15 重评审。

## 探针清理
- [ ] 删除测试 vault 里 `data.json` 内的 App 密码(凭据不留存)。
```

- [ ] **Step 2: 清理凭据**

Run(把 `$VAULT_PATH` 换成真实路径):
```bash
rm -f "$VAULT_PATH/.obsidian/plugins/ogenda/data.json"
```
Expected: 该文件删除,凭据不残留。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/spikes/2026-07-14-imapflow-electron-spike.md
git commit -m "docs(spike): record imapflow-in-electron outcome + GO/NO-GO decision"
```

---

## Self-Review

**1. Spec coverage(仅 Phase 0 范围):** spec §12 探针的三个通过点——TLS 连接(0.2)、拉到 ICS 原文(0.4)、ical.js 解析(0.4 bonus)——均有任务覆盖;§8 风险的 esbuild external 前提在 Global Constraints + 0.1 Step 4 + 0.2 Step 4 落实;§9 App 密码认证在 0.2;密钥清理在 0.5。Phase 1+ 明确不在本计划范围(scope 决策)。无遗漏。

**2. Placeholder scan:** 无 "TBD/待补"。0.5 报告是**待执行时按真实观测填写的模板**(探针的产物本就是观测结果),非代码占位;`$VAULT_PATH` 是执行前确认的输入,已在 Global Constraints 定义。

**3. Type consistency:** `SpikeSettings`(0.2 定义)在 `main.ts`/`imap-spike.ts` 一致使用;`makeClient`(0.2)被 `dumpOneInvite`(0.4)复用;`findCalendarParts(node): string[]`(0.3)被 0.4 按 `parts[0]` 使用一致;`imapConnectTest`/`dumpOneInvite` 签名 `(s: SpikeSettings) => Promise<void>` 与 `main.ts` 调用一致。

---

## 备注:后续

探针 **GO** 后,单独写 `docs/superpowers/plans/YYYY-MM-DD-ogenda-phase1-mvp.md`,覆盖 spec 的 Phase 1:事件模型、月度文件解析/序列化(格式1,upsert 保散文)、Gmail IMAP 连接器、议程列表视图、拉出笔记、safeStorage 密钥、手动/启动同步。探针里已验证的连接/抓取/解析代码直接演进为正式连接器。
