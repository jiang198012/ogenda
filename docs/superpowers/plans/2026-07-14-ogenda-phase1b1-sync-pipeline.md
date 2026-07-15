# ogenda Phase 1b-1 — 同步管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Phase 1a 的纯数据核心接到真插件上,交付一个可用的 **"Sync now"**:从 Gmail(IMAP)抓会议邀请 → 归一化 → 写入 `Agenda/YYYY-MM.md`(格式1,按 uid upsert、保散文),并在 demo-vault + Gmail 端到端验证。

**Architecture:** 用 `FileStore` 接口隔离 Obsidian Vault —— `MonthlyStore`/`SyncService` 只依赖 `FileStore`+核心纯函数,可用 `InMemoryFileStore` 完整单测;只有 `ObsidianFileStore` 薄适配层、`main.ts` 装配、Gmail 连接器是集成(需 Obsidian/Gmail 手动验证)。密钥只存内存、不落盘。

**Tech Stack:** TypeScript · vitest · Obsidian Vault/Plugin API · imapflow · ical.js(均在 Phase 0 验证过打包)

## Global Constraints

- 复用 Phase 1a 核心,**不重写**:`src/core/event.ts`(`AgendaEvent`)、`src/core/monthly-doc.ts`(`upsertEvents`)、`src/core/ical-map.ts`(`icalToEvents`)、`src/find-calendar-parts.ts`(`findCalendarParts`)。
- **密钥不落盘**:Gmail App 密码只存插件实例的内存字段 `appPassword`,**绝不写进 `data.json`**;持久化设置只含 `email/storageFolder/scanCount/syncOnStartup`。每会话重输。(safeStorage 已探针确认在 Obsidian 渲染进程不可用。)
- esbuild `target` 保持 `es2020`(imapflow 依赖需要)。桌面端 only,`isDesktopOnly: true`。
- Obsidian Vault API(已核实):`vault.getAbstractFileByPath` + `instanceof TFile/TFolder`、`vault.read`、`vault.create`、`vault.process`、`vault.createFolder`、`normalizePath`。用户路径都要 `normalizePath()`。
- 存储:`{storageFolder}/YYYY-MM.md`,新文件用 `# YYYY-MM\n` 作前言。
- 纯模块(`store/file-store`、`store/monthly-store`、`connectors/connector`、`sync/sync-service`)**不得** import `obsidian`/`imapflow`;只有 `store/obsidian-file-store.ts`、`connectors/gmail-imap.ts`、`settings/*`、`main.ts` 可依赖平台库。

---

### Task 1: FileStore 抽象 + InMemoryFileStore

**Files:** Create `src/store/file-store.ts`, `tests/store/file-store.test.ts`

**Interfaces:** Produces `interface FileStore { read(path): Promise<string|null>; write(path, content): Promise<void>; ensureFolder(path): Promise<void> }` 和 `class InMemoryFileStore implements FileStore`。

- [ ] **Step 1: 失败测试 `tests/store/file-store.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { InMemoryFileStore } from "../../src/store/file-store";

describe("InMemoryFileStore", () => {
  it("read of missing file returns null; write then read round-trips; overwrite works", async () => {
    const fs = new InMemoryFileStore();
    expect(await fs.read("Agenda/2026-07.md")).toBeNull();
    await fs.write("Agenda/2026-07.md", "hello");
    expect(await fs.read("Agenda/2026-07.md")).toBe("hello");
    await fs.write("Agenda/2026-07.md", "world");
    expect(await fs.read("Agenda/2026-07.md")).toBe("world");
  });
});
```
- [ ] **Step 2: 运行确认失败** — `npx vitest run tests/store/file-store.test.ts` → FAIL(模块不存在)。
- [ ] **Step 3: 实现 `src/store/file-store.ts`**
```ts
export interface FileStore {
  /** returns file content, or null if the file does not exist */
  read(path: string): Promise<string | null>;
  /** create the file if missing, otherwise overwrite */
  write(path: string, content: string): Promise<void>;
  /** create the folder (idempotent) */
  ensureFolder(path: string): Promise<void>;
}

export class InMemoryFileStore implements FileStore {
  files = new Map<string, string>();
  folders = new Set<string>();
  async read(path: string): Promise<string | null> {
    return this.files.has(path) ? this.files.get(path)! : null;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
}
```
- [ ] **Step 4: 运行确认通过** — PASS(1)。
- [ ] **Step 5: Commit** — `git add src/store/file-store.ts tests/store/file-store.test.ts && git commit -m "feat(store): FileStore interface + InMemoryFileStore"`

---

### Task 2: MonthlyStore.sync(按月分组 + upsert + 写回;含保散文)

**Files:** Create `src/store/monthly-store.ts`, `tests/store/monthly-store.test.ts`

**Interfaces:** Produces `function monthOf(startIso: string): string`;`interface SyncSummary { added: number; updated: number; months: string[] }`;`class MonthlyStore { constructor(store: FileStore, folder: string); sync(events: AgendaEvent[]): Promise<SyncSummary> }`。Consumes Task1 `FileStore`;核心 `AgendaEvent`/`upsertEvents`。

- [ ] **Step 1: 失败测试 `tests/store/monthly-store.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore, monthOf } from "../../src/store/monthly-store";

const mk = (uid: string, start: string, title: string): AgendaEvent => ({
  uid, title, start, origin: "synced", source: "imap/gmail", protocol: "imap",
});

describe("MonthlyStore", () => {
  it("monthOf extracts YYYY-MM", () => {
    expect(monthOf("2026-07-14T15:00:00")).toBe("2026-07");
    expect(monthOf("2026-12-01")).toBe("2026-12");
  });
  it("groups events into monthly files", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const s = await store.sync([mk("a@x", "2026-07-14T15:00:00", "七"), mk("b@x", "2026-08-01T09:00:00", "八")]);
    expect(s.added).toBe(2);
    expect(s.months.sort()).toEqual(["2026-07", "2026-08"]);
    expect(await fs.read("Agenda/2026-07.md")).toContain("a@x");
    expect(await fs.read("Agenda/2026-08.md")).toContain("b@x");
  });
  it("is idempotent by uid and preserves user prose across re-sync", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/\n$/, "") + "\n\n我的纪要\n");
    const s2 = await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    expect(s2.added).toBe(0);
    expect(s2.updated).toBe(1);
    expect(await fs.read(p)).toContain("我的纪要");
  });
});
```
- [ ] **Step 2: 运行确认失败** — FAIL(模块不存在)。
- [ ] **Step 3: 实现 `src/store/monthly-store.ts`**
```ts
import { AgendaEvent } from "../core/event";
import { upsertEvents } from "../core/monthly-doc";
import { FileStore } from "./file-store";

export function monthOf(startIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(startIso);
  return m ? `${m[1]}-${m[2]}` : "unknown";
}

export interface SyncSummary {
  added: number;
  updated: number;
  months: string[];
}

export class MonthlyStore {
  constructor(private store: FileStore, private folder: string) {}

  private pathFor(month: string): string {
    return `${this.folder}/${month}.md`;
  }

  async sync(events: AgendaEvent[]): Promise<SyncSummary> {
    const byMonth = new Map<string, AgendaEvent[]>();
    for (const ev of events) {
      const month = monthOf(ev.start);
      const list = byMonth.get(month) ?? [];
      list.push(ev);
      byMonth.set(month, list);
    }
    let added = 0;
    let updated = 0;
    const months: string[] = [];
    if (byMonth.size > 0) await this.store.ensureFolder(this.folder);
    for (const [month, monthEvents] of byMonth) {
      const path = this.pathFor(month);
      const existing = (await this.store.read(path)) ?? "";
      const seed = existing || `# ${month}\n`;
      const r = upsertEvents(seed, monthEvents);
      await this.store.write(path, r.text);
      added += r.added;
      updated += r.updated;
      months.push(month);
    }
    return { added, updated, months };
  }
}
```
- [ ] **Step 4: 运行确认通过** — PASS(3);再跑全套 `npx vitest run` 确认无回归。
- [ ] **Step 5: Commit** — `git add src/store/monthly-store.ts tests/store/monthly-store.test.ts && git commit -m "feat(store): MonthlyStore.sync — group by month, upsert, preserve prose"`

---

### Task 3: ObsidianFileStore 适配层(集成,无单测)

**Files:** Create `src/store/obsidian-file-store.ts`

**Interfaces:** Produces `class ObsidianFileStore implements FileStore`(用 `Vault`)。Consumes Task1 `FileStore`。

- [ ] **Step 1: 实现 `src/store/obsidian-file-store.ts`**
```ts
import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { FileStore } from "./file-store";

export class ObsidianFileStore implements FileStore {
  constructor(private vault: Vault) {}

  async read(path: string): Promise<string | null> {
    const f = this.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) return await this.vault.read(f);
    return null;
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const f = this.vault.getAbstractFileByPath(p);
    if (f instanceof TFile) {
      await this.vault.process(f, () => content);
    } else {
      await this.ensureParent(p);
      await this.vault.create(p, content);
    }
  }

  async ensureFolder(path: string): Promise<void> {
    const p = normalizePath(path);
    if (!(this.vault.getAbstractFileByPath(p) instanceof TFolder)) {
      await this.vault.createFolder(p).catch(() => {});
    }
  }

  private async ensureParent(filePath: string): Promise<void> {
    const idx = filePath.lastIndexOf("/");
    if (idx <= 0) return;
    const parent = filePath.slice(0, idx);
    if (!(this.vault.getAbstractFileByPath(parent) instanceof TFolder)) {
      await this.vault.createFolder(parent).catch(() => {});
    }
  }
}
```
- [ ] **Step 2: 构建检查** — `npm run build` exit 0(tsc 通过,类型对得上 Obsidian API)。无单测:纯 Obsidian 适配,行为在 Task 7 端到端验证。
- [ ] **Step 3: Commit** — `git add src/store/obsidian-file-store.ts && git commit -m "feat(store): ObsidianFileStore adapter over Vault"`

---

### Task 4: Connector 接口 + dedupeByUid + GmailImapConnector

**Files:** Create `src/connectors/connector.ts`, `src/connectors/gmail-imap.ts`, `tests/connectors/dedupe.test.ts`

**Interfaces:** Produces `interface Connector { id: string; fetch(): Promise<AgendaEvent[]> }`;`function dedupeByUid(events): AgendaEvent[]`;`interface GmailCreds { email: string; appPassword: string }`;`class GmailImapConnector implements Connector`。Consumes 核心 `findCalendarParts`(`src/find-calendar-parts.ts`)、`icalToEvents`(`src/core/ical-map.ts`)。

- [ ] **Step 1: 失败测试 `tests/connectors/dedupe.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { dedupeByUid } from "../../src/connectors/connector";

const mk = (uid: string, title: string): AgendaEvent => ({
  uid, title, start: "2026-07-14T15:00:00", origin: "synced", source: "s", protocol: "imap",
});

describe("dedupeByUid", () => {
  it("keeps one event per uid (last wins), drops uid-less", () => {
    const r = dedupeByUid([mk("a", "one"), mk("a", "two"), mk("b", "three")]);
    expect(r.length).toBe(2);
    expect(r.find((e) => e.uid === "a")!.title).toBe("two");
  });
});
```
- [ ] **Step 2: 运行确认失败** — FAIL。
- [ ] **Step 3: 实现 `src/connectors/connector.ts`**
```ts
import { AgendaEvent } from "../core/event";

export interface Connector {
  id: string;
  fetch(): Promise<AgendaEvent[]>;
}

export function dedupeByUid(events: AgendaEvent[]): AgendaEvent[] {
  const seen = new Map<string, AgendaEvent>();
  for (const e of events) {
    if (e.uid) seen.set(e.uid, e);
  }
  return [...seen.values()];
}
```
- [ ] **Step 4: 运行确认通过** — PASS(1)。
- [ ] **Step 5: 实现 `src/connectors/gmail-imap.ts`**(演进自 Phase 0 探针,已验证的调用)
```ts
import { ImapFlow } from "imapflow";
import { AgendaEvent } from "../core/event";
import { findCalendarParts } from "../find-calendar-parts";
import { icalToEvents } from "../core/ical-map";
import { Connector, dedupeByUid } from "./connector";

export interface GmailCreds {
  email: string;
  appPassword: string;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf-8");
}

export class GmailImapConnector implements Connector {
  id = "imap/gmail";
  constructor(private creds: GmailCreds, private scanCount: number) {}

  async fetch(): Promise<AgendaEvent[]> {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: this.creds.email, pass: this.creds.appPassword },
      logger: false,
    });
    const out: AgendaEvent[] = [];
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const total = mb ? mb.exists : 0;
      if (total > 0) {
        const start = Math.max(1, total - this.scanCount + 1);
        for await (const msg of client.fetch(`${start}:*`, {
          uid: true,
          bodyStructure: true,
          envelope: true,
        })) {
          const parts = findCalendarParts(msg.bodyStructure as any);
          for (const part of parts) {
            try {
              const dl = await client.download(msg.uid, part, { uid: true });
              const ics = await streamToString(dl.content);
              out.push(...icalToEvents(ics, this.id));
            } catch (e) {
              console.error("[ogenda] failed to read calendar part", part, e);
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return dedupeByUid(out);
  }
}
```
- [ ] **Step 6: 构建检查** — `npm run build` exit 0。GmailImapConnector 是网络集成件,行为在 Task 7 端到端验证。
- [ ] **Step 7: Commit** — `git add src/connectors/ tests/connectors/ && git commit -m "feat(connectors): Connector interface + dedupeByUid + GmailImapConnector"`

---

### Task 5: SyncService 编排

**Files:** Create `src/sync/sync-service.ts`, `tests/sync/sync-service.test.ts`

**Interfaces:** Produces `type Notify = (message: string) => void`;`class SyncService { constructor(connectors: Connector[], store: MonthlyStore, notify: Notify); syncNow(): Promise<SyncSummary> }`。Consumes Task2 `MonthlyStore`/`SyncSummary`、Task4 `Connector`。

- [ ] **Step 1: 失败测试 `tests/sync/sync-service.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore } from "../../src/store/monthly-store";
import { SyncService } from "../../src/sync/sync-service";

const mk = (uid: string, start: string): AgendaEvent => ({
  uid, title: "t", start, origin: "synced", source: "s", protocol: "imap",
});

describe("SyncService", () => {
  it("collects from connectors, writes to store, reports summary", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const conn = { id: "test", fetch: async () => [mk("a@x", "2026-07-14T15:00:00")] };
    const msgs: string[] = [];
    const svc = new SyncService([conn], store, (m) => msgs.push(m));
    const s = await svc.syncNow();
    expect(s.added).toBe(1);
    expect(await fs.read("Agenda/2026-07.md")).toContain("a@x");
    expect(msgs.some((m) => m.includes("同步完成"))).toBe(true);
  });
  it("keeps going when one connector throws", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const bad = { id: "bad", fetch: async () => { throw new Error("boom"); } };
    const good = { id: "good", fetch: async () => [mk("b@x", "2026-07-20T09:00:00")] };
    const msgs: string[] = [];
    const svc = new SyncService([bad, good], store, (m) => msgs.push(m));
    const s = await svc.syncNow();
    expect(s.added).toBe(1);
    expect(msgs.some((m) => m.includes("同步失败(bad)"))).toBe(true);
  });
});
```
- [ ] **Step 2: 运行确认失败** — FAIL。
- [ ] **Step 3: 实现 `src/sync/sync-service.ts`**
```ts
import { AgendaEvent } from "../core/event";
import { Connector } from "../connectors/connector";
import { MonthlyStore, SyncSummary } from "../store/monthly-store";

export type Notify = (message: string) => void;

export class SyncService {
  constructor(
    private connectors: Connector[],
    private store: MonthlyStore,
    private notify: Notify,
  ) {}

  async syncNow(): Promise<SyncSummary> {
    const all: AgendaEvent[] = [];
    for (const c of this.connectors) {
      try {
        all.push(...(await c.fetch()));
      } catch (e) {
        this.notify(`同步失败(${c.id}): ${(e as Error).message}`);
        console.error(`[ogenda] connector ${c.id} failed`, e);
      }
    }
    const summary = await this.store.sync(all);
    this.notify(`同步完成:新增 ${summary.added}、更新 ${summary.updated}(${summary.months.join(", ") || "无"})`);
    return summary;
  }
}
```
- [ ] **Step 4: 运行确认通过** — PASS(2);全套 `npx vitest run` 无回归。
- [ ] **Step 5: Commit** — `git add src/sync/ tests/sync/ && git commit -m "feat(sync): SyncService orchestration (per-connector error isolation)"`

---

### Task 6: 设置 + main.ts 装配(集成;移除 Phase 0 探针文件)

**Files:** Create `src/settings/settings.ts`, `src/settings/settings-tab.ts`;Rewrite `src/main.ts`;Delete `src/spike-settings.ts`, `src/imap-spike.ts`(被真连接器取代,main 不再 import)。

**Interfaces:** Produces `interface OgendaSettings`、`DEFAULT_SETTINGS`、`class OgendaSettingTab`;插件类含**瞬态** `appPassword`(不持久化)。

- [ ] **Step 1: `src/settings/settings.ts`**
```ts
export interface OgendaSettings {
  email: string;
  storageFolder: string;
  scanCount: number;
  syncOnStartup: boolean;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  email: "",
  storageFolder: "Agenda",
  scanCount: 50,
  syncOnStartup: false,
};
```
- [ ] **Step 2: `src/settings/settings-tab.ts`**(App 密码字段绑定瞬态 `plugin.appPassword`,**不** saveSettings)
```ts
import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "../main";

export class OgendaSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Gmail address").addText((t) =>
      t.setValue(this.plugin.settings.email).onChange(async (v) => {
        this.plugin.settings.email = v.trim();
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("App password (本会话内存,不落盘)")
      .setDesc("Gmail 16 位 App 专用密码;仅存内存,重启 Obsidian 后需重新输入。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.appPassword).onChange((v) => {
          this.plugin.appPassword = v.trim(); // transient — never persisted
        });
      });

    new Setting(containerEl).setName("Storage folder").addText((t) =>
      t.setValue(this.plugin.settings.storageFolder).onChange(async (v) => {
        this.plugin.settings.storageFolder = v.trim() || "Agenda";
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("Scan recent messages")
      .setDesc("扫描 INBOX 最近多少封邮件找日历邀请")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.scanCount)).onChange(async (v) => {
          const n = parseInt(v, 10);
          this.plugin.settings.scanCount = Number.isFinite(n) && n > 0 ? n : 50;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Sync on startup").addToggle((tg) =>
      tg.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
        this.plugin.settings.syncOnStartup = v;
        await this.plugin.saveSettings();
      })
    );
  }
}
```
- [ ] **Step 3: Rewrite `src/main.ts`**(完整替换)
```ts
import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, OgendaSettings } from "./settings/settings";
import { OgendaSettingTab } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { GmailImapConnector } from "./connectors/gmail-imap";
import { SyncService } from "./sync/sync-service";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;
  appPassword = ""; // transient, in-memory only — NEVER persisted to data.json

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-sync-now",
      name: "Sync now",
      callback: () => void this.syncNow(),
    });

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncNow());
    }
  }

  private buildSyncService(): SyncService | null {
    if (!this.settings.email || !this.appPassword) {
      new Notice("请先在 ogenda 设置里填 Gmail 地址 + App 密码(本会话)");
      return null;
    }
    const store = new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
    const connector = new GmailImapConnector(
      { email: this.settings.email, appPassword: this.appPassword },
      this.settings.scanCount,
    );
    return new SyncService([connector], store, (m) => new Notice(m));
  }

  async syncNow(): Promise<void> {
    const svc = this.buildSyncService();
    if (!svc) return;
    try {
      await svc.syncNow();
    } catch (e) {
      new Notice("同步出错: " + (e as Error).message);
      console.error("[ogenda] syncNow error", e);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```
- [ ] **Step 4: 删除探针文件** — `git rm src/spike-settings.ts src/imap-spike.ts`(main.ts 已不再 import 它们;`find-calendar-parts.ts` 保留,连接器在用)。
- [ ] **Step 5: 构建 + 全套测试** — `npm run build` exit 0(确认无残留 import 报错);`npx vitest run` 全绿。
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: wire sync pipeline into plugin; in-memory app password; remove Phase 0 spike files"`

---

### Task 7: 端到端验证(demo-vault + Gmail,手动)

**Files:** Create `docs/superpowers/spikes/2026-07-14-phase1b1-e2e.md`(记录结果)

- [ ] **Step 1: 链接与加载** — 确认 demo-vault 的 `.obsidian/plugins/ogenda/` 软链仍指向仓库 `main.js`/`manifest.json`;`npm run build`;Obsidian 里 reload ogenda。
- [ ] **Step 2: 配置** — ogenda 设置页填 Gmail 地址 + App 专用密码(本会话)+ storageFolder=`Agenda`。
- [ ] **Step 3: 首次同步** — 确保收件箱近 `scanCount` 封里有日历邀请 → `Cmd+P` → "ogenda: Sync now" → 期望 Notice `同步完成:新增 N…`;vault 里出现 `Agenda/2026-07.md`(或相应月份),含解析出的事件(uid/start/title 等字段,格式1)。
- [ ] **Step 4: 幂等验证** — 再次 "Sync now" → 期望 `新增 0、更新 N`;月度文件无重复事件块。
- [ ] **Step 5: 保散文验证** — 在某事件的字段清单下方手写一段笔记 → 再 "Sync now" → 那段笔记**原样保留**。
- [ ] **Step 6: 记录结果并 Commit** — 把 Steps 3–5 的真实观测写进 e2e 报告;`git add docs/... && git commit -m "docs: phase1b1 end-to-end verification"`。若任一步失败,记录报错、停下,按现象定位(store 适配 / 连接器 / 装配)。

---

## Self-Review

**1. Spec coverage(Phase 1b-1 范围):** Gmail IMAP 连接器(spec §2/§7 连接器,复用 Phase 0 验证代码)→ T4;月度文件 Vault 读写 + upsert(spec §6 存储契约)→ T2/T3;同步编排 + Sync now 命令 + 启动同步(spec §8)→ T5/T6;密钥内存态(替代已证不可用的 safeStorage,spec §9 修订)→ T6 + Global Constraints;端到端(spec §13)→ T7。议程视图 + 拉出笔记 = Phase 1b-2,不在本计划。

**2. Placeholder scan:** 无 TBD;每步含完整代码或明确命令。T7 是手动验证清单(需真 Gmail),其"记录真实观测"是探针产物、非占位。

**3. Type consistency:** `FileStore`(T1)被 `MonthlyStore`(T2)、`ObsidianFileStore`(T3)一致实现/消费;`MonthlyStore`/`SyncSummary`(T2)被 `SyncService`(T5)、`main`(T6)消费;`Connector`(T4)被 `SyncService`、`main` 消费;`GmailCreds`/`GmailImapConnector`(T4)被 `main` 消费;`OgendaSettings`+瞬态 `appPassword`(T6)贯穿设置页与 main;核心 `AgendaEvent`/`upsertEvents`/`icalToEvents`/`findCalendarParts` 路径与 Phase 1a 落点一致(`src/core/*` 与 `src/find-calendar-parts.ts`)。

---

## 备注:后续 Phase 1b-2

`store/monthly-store.ts` 加 `list(range)`(读月度文件 → EventBlock/AgendaEvent),`views/agenda-view.ts`(ItemView 按天分组渲染,`registerView`+`setViewState`),`commands/spin-off.ts`(从事件生成 `Agenda/notes/<slug>.md` + 回填 `note::`),main 注册视图与命令。最终仍在 demo-vault 验证。
