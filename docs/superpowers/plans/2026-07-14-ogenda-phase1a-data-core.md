# ogenda Phase 1a — 纯数据核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 ogenda 的纯数据核心——事件模型、月度文件(格式1)的解析/序列化、按 `uid` 的 upsert(**更新机器字段、绝不覆盖用户散文、去重、按时间排序**)、以及 ICS→AgendaEvent 归一化。全部纯逻辑,可脱离 Obsidian/网络完整单测。

**Architecture:** 三个纯模块:`core/event.ts`(类型 + 事件↔字段)、`core/monthly-doc.ts`(月度文档 parse/serialize/upsert)、`core/ical-map.ts`(ical.js VEVENT→事件)。下游(Phase 1b 的 MonthlyStore/连接器/视图)只消费这三者,不反向依赖。

**Tech Stack:** TypeScript · vitest · ical.js(Phase 0 已验证打包)

## Global Constraints

- 存储契约(spec §6):月度文件 = 事件块序列;每块 = `## 标题` + 连续 `- key:: value` 机器字段清单 + 其下用户散文。**边界规则**:标题下连续的 `- key:: value` 行是机器字段;首个非字段行起至下一 `## ` 为用户散文,永不被 upsert 覆盖。
- 字段键用 **snake_case**(`all_day`、`last_synced`),与 spec §6 示例一致。schema 开放:解析保留未知字段并原样写回。
- `uid` 是去重主键。upsert 幂等:同一 uid 多次同步只更新、不新增。
- 事件在文件内按 `start` **升序**排列(chronological agenda)。
- 纯逻辑:本阶段任何模块**不得** import `obsidian`、`imapflow`、Node `fs`。仅 `core/ical-map.ts` 依赖 `ical.js`。

---

### Task 1a.1: AgendaEvent 模型 + eventToFields

**Files:**
- Create: `src/core/event.ts`, `tests/core/event.test.ts`

**Interfaces:**
- Produces: `interface AgendaEvent`;`type EventOrigin`;`function eventToFields(ev: AgendaEvent): Record<string, string>`(camelCase 事件 → snake_case 文件字段,空值省略,`attendees` 以 `, ` 连接)。

- [ ] **Step 1: 写失败测试 `tests/core/event.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { AgendaEvent, eventToFields } from "../../src/core/event";

const ev: AgendaEvent = {
  uid: "abc@x",
  title: "团队周会",
  start: "2026-07-14T15:00:00",
  end: "2026-07-14T16:00:00",
  allDay: false,
  tz: "Asia/Shanghai",
  location: "会议室A",
  organizer: "alice@example.com",
  attendees: ["a@x", "b@x"],
  status: "confirmed",
  origin: "synced",
  source: "imap/gmail",
  protocol: "imap",
};

describe("eventToFields", () => {
  it("maps camelCase event to snake_case file fields", () => {
    const f = eventToFields(ev);
    expect(f.uid).toBe("abc@x");
    expect(f.title).toBe("团队周会");
    expect(f.start).toBe("2026-07-14T15:00:00");
    expect(f.all_day).toBe("false");
    expect(f.attendees).toBe("a@x, b@x");
    expect(f.source).toBe("imap/gmail");
  });
  it("omits empty/undefined fields", () => {
    const f = eventToFields({ uid: "u", title: "t", start: "2026-07-14T09:00:00", origin: "local" });
    expect("end" in f).toBe(false);
    expect("location" in f).toBe(false);
    expect(f.origin).toBe("local");
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/core/event.test.ts`
Expected: FAIL — 无法解析 `../../src/core/event`。

- [ ] **Step 3: 写实现 `src/core/event.ts`**

```ts
export type EventOrigin = "synced" | "local";

export interface AgendaEvent {
  uid: string;
  title: string;
  start: string; // ISO8601, e.g. "2026-07-14T15:00:00"
  end?: string;
  allDay?: boolean;
  tz?: string;
  location?: string;
  url?: string;
  organizer?: string;
  attendees?: string[];
  status?: string;
  rsvp?: string;
  busy?: string;
  origin: EventOrigin;
  source?: string;
  protocol?: string;
  etag?: string;
  seq?: number;
  lastSynced?: string;
  rrule?: string;
}

export function eventToFields(ev: AgendaEvent): Record<string, string> {
  const f: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => {
    if (v !== undefined && v !== "") f[k] = v;
  };
  set("uid", ev.uid);
  set("title", ev.title);
  set("start", ev.start);
  set("end", ev.end);
  if (ev.allDay !== undefined) set("all_day", String(ev.allDay));
  set("tz", ev.tz);
  set("location", ev.location);
  set("url", ev.url);
  set("organizer", ev.organizer);
  if (ev.attendees && ev.attendees.length) set("attendees", ev.attendees.join(", "));
  set("status", ev.status);
  set("rsvp", ev.rsvp);
  set("busy", ev.busy);
  set("origin", ev.origin);
  set("source", ev.source);
  set("protocol", ev.protocol);
  set("etag", ev.etag);
  if (ev.seq !== undefined) set("seq", String(ev.seq));
  set("last_synced", ev.lastSynced);
  set("rrule", ev.rrule);
  return f;
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/core/event.test.ts`
Expected: PASS (2 passed)。

- [ ] **Step 5: Commit**

```bash
git add src/core/event.ts tests/core/event.test.ts
git commit -m "feat(core): AgendaEvent model + eventToFields"
```

---

### Task 1a.2: 月度文档 parse / serialize(格式1,保留未知字段与散文)

**Files:**
- Create: `src/core/monthly-doc.ts`, `tests/core/monthly-doc.test.ts`

**Interfaces:**
- Produces: `interface EventBlock { heading; fields; fieldOrder; prose }`;`function parseMonthlyDoc(text): { preamble: string; blocks: EventBlock[] }`;`function serializeMonthlyDoc(preamble, blocks): string`。
- Consumes: 无(纯字符串)。

- [ ] **Step 1: 写失败测试 `tests/core/monthly-doc.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseMonthlyDoc, serializeMonthlyDoc } from "../../src/core/monthly-doc";

const doc = `# 2026-07

## 15:00–16:00 团队周会
- uid:: abc@x
- start:: 2026-07-14T15:00:00
- custom:: keep-me

我自己记的纪要,别动。
- [ ] 会前准备

## 09:00 晨会
- uid:: def@x
- start:: 2026-07-15T09:00:00
`;

describe("parseMonthlyDoc", () => {
  it("splits preamble + event blocks with fields and prose", () => {
    const { preamble, blocks } = parseMonthlyDoc(doc);
    expect(preamble).toBe("# 2026-07");
    expect(blocks.length).toBe(2);
    expect(blocks[0].heading).toBe("15:00–16:00 团队周会");
    expect(blocks[0].fields.uid).toBe("abc@x");
    expect(blocks[0].fields.custom).toBe("keep-me"); // 未知字段保留
    expect(blocks[0].prose).toContain("我自己记的纪要");
    expect(blocks[0].prose).toContain("- [ ] 会前准备");
    expect(blocks[1].fields.uid).toBe("def@x");
    expect(blocks[1].prose).toBe("");
  });
  it("round-trips: parse then serialize preserves content", () => {
    const { preamble, blocks } = parseMonthlyDoc(doc);
    const out = serializeMonthlyDoc(preamble, blocks);
    const again = parseMonthlyDoc(out);
    expect(again.blocks[0].fields.custom).toBe("keep-me");
    expect(again.blocks[0].prose).toContain("我自己记的纪要");
    expect(again.blocks.length).toBe(2);
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/core/monthly-doc.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 写实现 `src/core/monthly-doc.ts`**

```ts
export interface EventBlock {
  heading: string;
  fields: Record<string, string>;
  fieldOrder: string[];
  prose: string;
}

const HEADING_RE = /^##\s+(.*)$/;
const FIELD_RE = /^-\s+([A-Za-z0-9_]+)::\s?(.*)$/;

export function parseMonthlyDoc(text: string): { preamble: string; blocks: EventBlock[] } {
  const lines = text.split("\n");
  const blocks: EventBlock[] = [];
  const preambleLines: string[] = [];
  let cur:
    | { heading: string; fieldOrder: string[]; fields: Record<string, string>; proseLines: string[]; inFields: boolean }
    | null = null;

  const flush = () => {
    if (!cur) return;
    blocks.push({
      heading: cur.heading,
      fields: cur.fields,
      fieldOrder: cur.fieldOrder,
      prose: cur.proseLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
    });
    cur = null;
  };

  for (const line of lines) {
    const h = HEADING_RE.exec(line);
    if (h) {
      flush();
      cur = { heading: h[1].trim(), fieldOrder: [], fields: {}, proseLines: [], inFields: true };
      continue;
    }
    if (!cur) {
      preambleLines.push(line);
      continue;
    }
    if (cur.inFields) {
      const f = FIELD_RE.exec(line);
      if (f) {
        cur.fieldOrder.push(f[1]);
        cur.fields[f[1]] = f[2];
        continue;
      }
      cur.inFields = false;
      cur.proseLines.push(line);
    } else {
      cur.proseLines.push(line);
    }
  }
  flush();
  return { preamble: preambleLines.join("\n").replace(/\n+$/, ""), blocks };
}

export function serializeEventBlock(b: EventBlock): string {
  const fieldLines = b.fieldOrder
    .filter((k) => b.fields[k] !== undefined)
    .map((k) => `- ${k}:: ${b.fields[k]}`);
  let out = `## ${b.heading}\n${fieldLines.join("\n")}`;
  if (b.prose && b.prose.trim().length) out += `\n\n${b.prose}`;
  return out;
}

export function serializeMonthlyDoc(preamble: string, blocks: EventBlock[]): string {
  const parts: string[] = [];
  if (preamble && preamble.trim().length) parts.push(preamble.trim());
  for (const b of blocks) parts.push(serializeEventBlock(b));
  return parts.join("\n\n") + "\n";
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/core/monthly-doc.test.ts`
Expected: PASS (2 passed)。

- [ ] **Step 5: Commit**

```bash
git add src/core/monthly-doc.ts tests/core/monthly-doc.test.ts
git commit -m "feat(core): monthly-doc parse/serialize (format1, preserves unknown fields + prose)"
```

---

### Task 1a.3: upsertEvents —— 按 uid 更新机器字段、保散文、去重、按时间排序(linchpin)

**Files:**
- Modify: `src/core/monthly-doc.ts`(加 `eventHeading`、`upsertEvents`)
- Create: `tests/core/upsert.test.ts`

**Interfaces:**
- Produces: `function eventHeading(ev: AgendaEvent): string`;`interface UpsertResult { text; added; updated }`;`function upsertEvents(text: string, events: AgendaEvent[]): UpsertResult`。
- Consumes: 1a.1 `AgendaEvent`/`eventToFields`;1a.2 `parseMonthlyDoc`/`serializeMonthlyDoc`。

- [ ] **Step 1: 写失败测试 `tests/core/upsert.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { upsertEvents, parseMonthlyDoc } from "../../src/core/monthly-doc";

const mk = (uid: string, start: string, title: string): AgendaEvent => ({
  uid, title, start, origin: "synced", source: "imap/gmail", protocol: "imap",
});

describe("upsertEvents", () => {
  it("adds a new event into empty doc", () => {
    const r = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(0);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.uid).toBe("a@x");
    expect(blocks[0].heading).toContain("周会");
  });

  it("is idempotent by uid (no duplicate)", () => {
    const one = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]).text;
    const two = upsertEvents(one, [mk("a@x", "2026-07-14T15:00:00", "周会")]);
    expect(two.added).toBe(0);
    expect(two.updated).toBe(1);
    expect(parseMonthlyDoc(two.text).blocks.length).toBe(1);
  });

  it("updates machine fields but NEVER touches user prose", () => {
    let text = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]).text;
    // 用户在事件下加散文
    text = text.replace(/\n$/, "") + "\n\n我的纪要:讨论了X。\n";
    // 标题变更 + 新增 location 的再同步
    const changed: AgendaEvent = { ...mk("a@x", "2026-07-14T15:00:00", "周会(改)"), location: "会议室B" };
    const r = upsertEvents(text, [changed]);
    expect(r.updated).toBe(1);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.location).toBe("会议室B");
    expect(blocks[0].heading).toContain("周会(改)");
    expect(blocks[0].prose).toContain("我的纪要:讨论了X");
  });

  it("sorts events chronologically by start", () => {
    const r = upsertEvents("", [
      mk("b@x", "2026-07-20T09:00:00", "晚的"),
      mk("a@x", "2026-07-14T15:00:00", "早的"),
    ]);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.uid).toBe("a@x");
    expect(blocks[1].fields.uid).toBe("b@x");
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/core/upsert.test.ts`
Expected: FAIL — `upsertEvents`/`eventHeading` 未导出。

- [ ] **Step 3: 在 `src/core/monthly-doc.ts` 顶部加 import,并在末尾追加实现**

顶部加:
```ts
import { AgendaEvent, eventToFields } from "./event";
```
末尾追加:
```ts
export function eventHeading(ev: AgendaEvent): string {
  const hhmm = (iso?: string): string => {
    if (!iso) return "";
    const m = /T(\d{2}:\d{2})/.exec(iso);
    return m ? m[1] : "";
  };
  if (ev.allDay) return ev.title;
  const s = hhmm(ev.start);
  const e = hhmm(ev.end);
  const time = s ? (e ? `${s}–${e}` : s) : "";
  return time ? `${time} ${ev.title}` : ev.title;
}

export interface UpsertResult {
  text: string;
  added: number;
  updated: number;
}

export function upsertEvents(text: string, events: AgendaEvent[]): UpsertResult {
  const { preamble, blocks } = parseMonthlyDoc(text);
  const byUid = new Map<string, EventBlock>();
  for (const b of blocks) {
    const u = b.fields["uid"];
    if (u) byUid.set(u, b);
  }
  let added = 0;
  let updated = 0;
  for (const ev of events) {
    const mf = eventToFields(ev);
    const existing = byUid.get(ev.uid);
    if (existing) {
      for (const [k, v] of Object.entries(mf)) {
        if (!existing.fieldOrder.includes(k)) existing.fieldOrder.push(k);
        existing.fields[k] = v;
      }
      existing.heading = eventHeading(ev);
      updated++;
    } else {
      const nb: EventBlock = {
        heading: eventHeading(ev),
        fields: { ...mf },
        fieldOrder: Object.keys(mf),
        prose: "",
      };
      blocks.push(nb);
      byUid.set(ev.uid, nb);
      added++;
    }
  }
  blocks.sort((a, b) => (a.fields["start"] || "").localeCompare(b.fields["start"] || ""));
  return { text: serializeMonthlyDoc(preamble, blocks), added, updated };
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/core/upsert.test.ts`
Expected: PASS (4 passed)。**"保散文"那条是本项目数据安全的核心保证。**

- [ ] **Step 5: Commit**

```bash
git add src/core/monthly-doc.ts tests/core/upsert.test.ts
git commit -m "feat(core): upsertEvents — uid dedup, update machine fields, preserve prose, sort by time"
```

---

### Task 1a.4: ICS → AgendaEvent 归一化

**Files:**
- Create: `src/core/ical-map.ts`, `tests/core/ical-map.test.ts`

**Interfaces:**
- Produces: `function icalToEvents(ics: string, source: string): AgendaEvent[]`。
- Consumes: 1a.1 `AgendaEvent`;`ical.js`。

- [ ] **Step 1: 写失败测试 `tests/core/ical-map.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { icalToEvents } from "../../src/core/ical-map";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:evt-1@example.com
SUMMARY:团队周会
DTSTART:20260714T070000Z
DTEND:20260714T080000Z
LOCATION:会议室A
ORGANIZER:mailto:alice@example.com
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

describe("icalToEvents", () => {
  it("maps a VEVENT to an AgendaEvent", () => {
    const evs = icalToEvents(ICS, "imap/gmail");
    expect(evs.length).toBe(1);
    const e = evs[0];
    expect(e.uid).toBe("evt-1@example.com");
    expect(e.title).toBe("团队周会");
    expect(e.start).toContain("2026-07-14T");
    expect(e.location).toBe("会议室A");
    expect(e.origin).toBe("synced");
    expect(e.source).toBe("imap/gmail");
    expect(e.protocol).toBe("imap");
  });
});
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/core/ical-map.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 写实现 `src/core/ical-map.ts`**

```ts
import ICAL from "ical.js";
import { AgendaEvent } from "./event";

export function icalToEvents(ics: string, source: string): AgendaEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  const vevents = comp.getAllSubcomponents("vevent");
  const out: AgendaEvent[] = [];
  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    const start = ev.startDate;
    const end = ev.endDate;
    const organizer = ve.getFirstPropertyValue("organizer");
    const attendees = ve
      .getAllProperties("attendee")
      .map((p) => String(p.getFirstValue() ?? ""))
      .filter((s) => s.length > 0);
    const status = ve.getFirstPropertyValue("status");
    const rrule = ve.getFirstProperty("rrule");
    out.push({
      uid: ev.uid,
      title: ev.summary || "(no title)",
      start: start ? start.toString() : "",
      end: end ? end.toString() : undefined,
      allDay: start ? start.isDate : undefined,
      tz: start && start.zone && start.zone.tzid ? start.zone.tzid : undefined,
      location: ev.location || undefined,
      organizer: organizer ? String(organizer).replace(/^mailto:/i, "") : undefined,
      attendees: attendees.length ? attendees.map((a) => a.replace(/^mailto:/i, "")) : undefined,
      status: status ? String(status).toLowerCase() : undefined,
      rrule: rrule ? String(rrule.toString()) : undefined,
      origin: "synced",
      source,
      protocol: "imap",
    });
  }
  return out;
}
```

- [ ] **Step 4: 运行,确认通过(若 ical.js API 细节有出入,以测试为准微调后再过)**

Run: `npx vitest run tests/core/ical-map.test.ts`
Expected: PASS (1 passed)。
Note: `ICAL.Time.toString()`/`isDate`/`zone.tzid`、`getFirstPropertyValue` 等是 ical.js 的实际 API;若某处签名不符,按报错微调实现直到测试通过(TDD:测试即规格)。

- [ ] **Step 5: 全量测试 + Commit**

Run: `npx vitest run tests/`
Expected: 全部 PASS(event 2 + monthly-doc 2 + upsert 4 + ical-map 1 + 既有 find-calendar-parts 2 = 11)。
```bash
git add src/core/ical-map.ts tests/core/ical-map.test.ts
git commit -m "feat(core): ical.js VEVENT -> AgendaEvent mapping"
```

---

## Self-Review

**1. Spec coverage(Phase 1a 范围):** 事件模型(spec §5 超集字段)→ 1a.1;月度文件格式1 + 边界规则(spec §6)→ 1a.2;"upsert 保散文、按 uid 去重、按时间排序"(spec §4/§6/§10 数据安全第一原则)→ 1a.3;ICS→事件归一化(spec §4 数据流首段)→ 1a.4。MonthlyStore(Vault I/O)、连接器、视图、拉出笔记、safeStorage、同步编排属 **Phase 1b**,不在本计划。

**2. Placeholder scan:** 无 TBD/占位。1a.4 Step4 的"按报错微调"是 TDD 常规收敛,非代码占位(实现已给全)。

**3. Type consistency:** `AgendaEvent`(1a.1)贯穿 1a.3/1a.4;`eventToFields`(1a.1)被 1a.3 `upsertEvents` 使用;`EventBlock`/`parseMonthlyDoc`/`serializeMonthlyDoc`(1a.2)被 1a.3 复用;`upsertEvents(text, events) → {text,added,updated}` 签名与测试一致;`icalToEvents(ics, source)` 与测试一致。字段键 snake_case(`all_day`/`last_synced`)在模型与文档层一致。

---

## 备注:后续 Phase 1b

1a 全绿后写 `docs/superpowers/plans/YYYY-MM-DD-ogenda-phase1b-integration.md`:`store/monthly-store.ts`(用 Obsidian Vault API 读写月度文件,内部调用 1a 的 `upsertEvents`)、`connectors/gmail-imap.ts`(探针代码 + `findCalendarParts` + `icalToEvents` 组装成连接器)、`sync/sync-service.ts`、`views/agenda-view.ts`、`commands/spin-off.ts`、`settings/*` + `secret-store.ts`(safeStorage)、`main.ts` 装配。最终在 demo-vault + Gmail 端到端验证。
