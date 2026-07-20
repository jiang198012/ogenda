# Ogenda 备注字段 + 推送补全 + 往返一致 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 事件新增双向同步的「备注」(DESCRIPTION) 字段,推送补全组织者/参与者/状态/分类/RRULE,并扩展哈希与转换层保证往返一致;顺带标题输入框铺满。

**Architecture:** 以「一致性铁律」为中心:凡进 `hashEvent` 的字段必须同时被 ical-map 解析 ∩ ical-gen 推送 ∩ md 存储 ∩ fieldsToEvent 重建。备注在 md 中以转义单行存储(`\`→`\\`、换行→`\n`);哈希采用**条件标记追加**(见下「与 spec 的偏差」);sync 路径新增字段清除清单,使服务器端删字段能传播到本地。

**Tech Stack:** TypeScript + Vitest + jsdom;ical.js(已在依赖);无新依赖。

**Spec:** `docs/superpowers/specs/2026-07-19-ogenda-description-sync-design.md`(用户已批准)

## Global Constraints

- 分支:`feat/description-sync`(已建,spec 已提交其上)。
- **minAppVersion 保持 1.5.0,永不提高**;不新增 npm 依赖。
- commit message 必须以空行 + 以下 trailer 结尾(逐字):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 每个任务结束 `npm test` 全绿;Task 6 还需 `npm run build` 干净(modal 不可单测)。
- 代码注释用英文(与仓库现状一致);提交信息用英文短句。
- rsvp、tags 保持纯本地:不解析、不推送、不进哈希、**不清除**(SYNC_CLEARABLE_FIELDS 绝不含它们,也不含 etag/href/base_hash/origin/source/protocol/seq/last_synced/url/busy/tz)。
- RRULE 推送时**原样输出,不做 escapeText**(它是结构化值;BYDAY 列表自带逗号)。

## 与 spec 的偏差(一处,实现细化)

spec 写「canon 列表在现有 5 项后追加 `ev.description ?? ""` 等 5 项」。朴素追加会让**所有**已同步事件的哈希在升级后全部翻转(canon 串变长)→ 首次同步全量重推。本计划改为**条件标记追加**:

- 新字段全空时 canon 与旧算法逐字节相同 → 哈希不变 → 无全量重推;
- 仅追加非空字段,且每项带字段名前缀(`description\0值`),避免「只有 description=X」与「只有 organizer=X」哈希撞车;
- md 里已含 status/organizer 等旧数据的事件会翻转一次 → 推送一次把新字段回填服务器 —— 这是本批的预期效果,且经往返一致性建设后稳定自愈。

**哈希字段集与 spec 完全一致**(title/start/end/allDay/location + description/organizer/attendees/status/category;rsvp/tags/rrule 不进),仅编码方式优化。

## 已验证的外部事实(ical.js 行为,node 实测)

- `getFirstPropertyValue("categories")`:`CATEGORIES:a,b` → `"a"`(只取第一值);`CATEGORIES:a\,b` → `"a,b"`(转义逗号=单值,自动反转义);重复 CATEGORIES 行 → 第一行的第一值。
- `getFirstPropertyValue("description")` 返回**完全反转义**文本(`\n`→真实换行,`\\`→`\`)。
- `rrule.toString()` 输出规范序:`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE`(FREQ 在前)。

---

### Task 1: core/event.ts — description 模型 + 转义对 + hashEvent 条件追加

**Files:**
- Modify: `src/core/event.ts`
- Test: `tests/core/event.test.ts`

**Interfaces:**
- Produces(后续任务依赖):
  - `AgendaEvent.description?: string`(插在 `location?: string;` 之后)
  - `escapeMultiline(s: string): string` — `\`→`\\`、换行→`\n`
  - `unescapeMultiline(s: string): string` — 严格逆运算
  - `eventToFields` 写出 `description`(转义后,空/undefined 不写)
  - `hashEvent` 条件标记追加 5 个新字段

- [x] **Step 1: 写失败测试**

在 `tests/core/event.test.ts` 末尾追加:

```ts
import { escapeMultiline, unescapeMultiline } from "../../src/core/event";

describe("escapeMultiline / unescapeMultiline", () => {
  it("escapes newlines and backslashes for single-line md storage, and reverses exactly", () => {
    const raw = "第一行\n第二行;含,标点\\反斜杠";
    const esc = escapeMultiline(raw);
    expect(esc).not.toContain("\n");
    expect(esc).toBe("第一行\\n第二行;含,标点\\\\反斜杠");
    expect(unescapeMultiline(esc)).toBe(raw);
  });
  it("preserves a user-typed literal backslash-n through the round-trip", () => {
    const raw = "字面\\n不是换行";
    expect(unescapeMultiline(escapeMultiline(raw))).toBe(raw);
  });
  it("normalizes CRLF to \\n", () => {
    expect(escapeMultiline("a\r\nb")).toBe("a\\nb");
  });
});

describe("eventToFields — description", () => {
  it("writes description escaped as a single line", () => {
    const f = eventToFields({ uid: "u", title: "t", start: "2026-07-14T09:00:00", origin: "local", description: "一\n二" });
    expect(f.description).toBe("一\\n二");
  });
  it("omits description when empty/undefined", () => {
    expect("description" in eventToFields({ uid: "u", title: "t", start: "s", origin: "local" })).toBe(false);
  });
});

describe("hashEvent — extended field set", () => {
  /** Pre-extension canonical hash (5 base fields only), kept as an upgrade-stability oracle. */
  function legacyHash(ev: AgendaEvent): string {
    const canon = [
      ev.title ?? "", ev.start ?? "", ev.end ?? "",
      ev.allDay === undefined ? "" : String(ev.allDay), ev.location ?? "",
    ].join("\0");
    let h = 0x811c9dc5;
    for (let i = 0; i < canon.length; i++) { h ^= canon.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  const b: AgendaEvent = { uid: "u", title: "会", start: "2026-07-14T15:00:00", origin: "synced" };

  it("keeps the pre-extension hash when none of the new fields are set (no mass re-push on upgrade)", () => {
    expect(hashEvent(b)).toBe(legacyHash(b));
    expect(hashEvent({ ...b, end: "2026-07-14T16:00:00", allDay: false, location: "A" })).toBe(
      legacyHash({ ...b, end: "2026-07-14T16:00:00", allDay: false, location: "A" }),
    );
  });
  it("changes when any synced field changes", () => {
    expect(hashEvent({ ...b, description: "备注" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, organizer: "a@x" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, attendees: ["a@x"] })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, status: "confirmed" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, category: "工作" })).not.toBe(hashEvent(b));
  });
  it("does NOT change for local-only or non-hashed fields (rsvp/tags/rrule/tz/url)", () => {
    expect(hashEvent({ ...b, rsvp: "ACCEPTED" })).toBe(hashEvent(b));
    expect(hashEvent({ ...b, tags: ["x"] })).toBe(hashEvent(b));
    expect(hashEvent({ ...b, rrule: "FREQ=DAILY" })).toBe(hashEvent(b));
  });
  it("distinguishes which field a value lives in (no aliasing between single appended fields)", () => {
    expect(hashEvent({ ...b, description: "X" })).not.toBe(hashEvent({ ...b, organizer: "X" }));
    expect(hashEvent({ ...b, status: "X" })).not.toBe(hashEvent({ ...b, category: "X" }));
  });
  it("attendees order matters (join is positional)", () => {
    expect(hashEvent({ ...b, attendees: ["a@x", "b@x"] })).not.toBe(hashEvent({ ...b, attendees: ["b@x", "a@x"] }));
  });
});
```

并把文件顶部 import 改为:

```ts
import { AgendaEvent, eventToFields, hashEvent, escapeMultiline, unescapeMultiline } from "../../src/core/event";
```

(若上面追加段里已单独 import,则合并为一行,去掉重复。)

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/core/event.test.ts`
Expected: FAIL(`escapeMultiline is not a function` / `description` 相关断言失败)

- [x] **Step 3: 实现 `src/core/event.ts`**

3a. `AgendaEvent` 接口中,`location?: string;` 之后插入:

```ts
  description?: string;
```

3b. `eventToFields` 中,`set("location", ev.location);` 之后插入:

```ts
  if (ev.description !== undefined && ev.description !== "") f.description = escapeMultiline(ev.description);
```

3c. `hashEvent` 整个替换为:

```ts
/**
 * Hash of the calendar-meaningful fields (what gets written back to the server).
 * Metadata (etag/href/base_hash/source/protocol/origin) is intentionally excluded,
 * so a re-sync that only refreshes metadata does not look like a local edit.
 *
 * The five base fields always take fixed positions. The extended fields
 * (description/organizer/attendees/status/category) are appended ONLY when
 * non-empty, each tagged with its field name, so:
 *   - an event with none of them hashes byte-identically to the pre-extension
 *     algorithm (no mass re-push of the whole calendar on upgrade), and
 *   - "description=X only" never collides with "organizer=X only".
 * Local-only fields (rsvp/tags) and parse-only fields (rrule) are not hashed.
 */
export function hashEvent(ev: AgendaEvent): string {
  const canon = [
    ev.title ?? "",
    ev.start ?? "",
    ev.end ?? "",
    ev.allDay === undefined ? "" : String(ev.allDay),
    ev.location ?? "",
  ];
  if (ev.description) canon.push(`description\0${ev.description}`);
  if (ev.organizer) canon.push(`organizer\0${ev.organizer}`);
  if (ev.attendees && ev.attendees.length) canon.push(`attendees\0${ev.attendees.join(", ")}`);
  if (ev.status) canon.push(`status\0${ev.status}`);
  if (ev.category) canon.push(`category\0${ev.category}`);
  const joined = canon.join("\0");
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
```

3d. 文件末尾追加转义对:

```ts
/** Escapes a multi-line string for single-line md field storage: `\` → `\\`, newline → `\n`. */
export function escapeMultiline(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
}

/** Exact inverse of escapeMultiline: `\\` → `\`, `\n` → newline. */
export function unescapeMultiline(s: string): string {
  return s.replace(/\\(\\|n)/g, (_m, c) => (c === "n" ? "\n" : "\\"));
}
```

注意 `eventToFields` 在 `hashEvent` 之前定义,`escapeMultiline` 的函数声明提升使其可用;若 tsc 报顺序问题,把转义对移到 `eventToFields` 之前。

- [x] **Step 4: 跑测试确认通过 + 全量绿**

Run: `npx vitest run tests/core/event.test.ts && npm test`
Expected: PASS;全量通过(既有测试不受影响)

- [x] **Step 5: Commit**

```bash
git add src/core/event.ts tests/core/event.test.ts
git commit -m "feat(event): add description field, multiline md escaping, extend hashEvent (conditional tagged append)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: ical-map.ts — DESCRIPTION + CATEGORIES 解析

**Files:**
- Modify: `src/core/ical-map.ts`
- Test: `tests/core/ical-map.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent.description` / `AgendaEvent.category`(Task 1)
- Produces: `icalToEvents` 输出事件带 `description`(反转义后原文)与 `category`(CATEGORIES 第一值)

- [x] **Step 1: 写失败测试**

在 `tests/core/ical-map.test.ts` 末尾追加:

```ts
describe("icalToEvents — description & categories", () => {
  const mk = (extra: string) =>
    `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\nBEGIN:VEVENT\nUID:u@x\nSUMMARY:会\nDTSTART:20260714T070000Z\n${extra}\nEND:VEVENT\nEND:VCALENDAR`;

  it("parses DESCRIPTION with full unescaping (\\n → real newline)", () => {
    const e = icalToEvents(mk("DESCRIPTION:第一行\\n第二行\\;含\\,标点"), "s")[0];
    expect(e.description).toBe("第一行\n第二行;含,标点");
  });
  it("description is undefined when absent", () => {
    expect(icalToEvents(mk("LOCATION:A"), "s")[0].description).toBeUndefined();
  });
  it("parses CATEGORIES single value into category", () => {
    expect(icalToEvents(mk("CATEGORIES:工作"), "s")[0].category).toBe("工作");
  });
  it("takes only the FIRST value of a multi-value CATEGORIES (documented limitation)", () => {
    expect(icalToEvents(mk("CATEGORIES:a,b"), "s")[0].category).toBe("a");
  });
  it("an escaped comma keeps CATEGORIES a single value (round-trips our own push)", () => {
    expect(icalToEvents(mk("CATEGORIES:a\\,b"), "s")[0].category).toBe("a,b");
  });
  it("takes the first line of repeated CATEGORIES properties", () => {
    expect(icalToEvents(mk("CATEGORIES:a\nCATEGORIES:b"), "s")[0].category).toBe("a");
  });
  it("category is undefined when absent", () => {
    expect(icalToEvents(mk("LOCATION:A"), "s")[0].category).toBeUndefined();
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/core/ical-map.test.ts`
Expected: FAIL(`description`/`category` 为 undefined 的断言失败)

- [x] **Step 3: 实现 `src/core/ical-map.ts`**

在 `const rrule = ve.getFirstPropertyValue("rrule");`(第 19 行)之后插入:

```ts
    const description = ve.getFirstPropertyValue("description");
    // Multi-value CATEGORIES: only the first value is kept (documented limitation).
    const categories = ve.getFirstPropertyValue("categories");
```

在返回对象的 `rrule: rrule ? String(rrule.toString()) : undefined,` 之后插入:

```ts
      description: description ? String(description) : undefined,
      category: categories ? String(categories) : undefined,
```

- [x] **Step 4: 跑测试确认通过 + 全量绿**

Run: `npx vitest run tests/core/ical-map.test.ts && npm test`
Expected: PASS;全量通过

- [x] **Step 5: Commit**

```bash
git add src/core/ical-map.ts tests/core/ical-map.test.ts
git commit -m "feat(ical-map): parse DESCRIPTION and CATEGORIES (first value)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ical-gen.ts — 推送扩字段(DESCRIPTION/ORGANIZER/ATTENDEE/STATUS/CATEGORIES/RRULE)

**Files:**
- Modify: `src/core/ical-gen.ts`
- Test: `tests/core/ical-gen.test.ts`

**Interfaces:**
- Consumes: `AgendaEvent` 全字段(Task 1);`icalToEvents` 新解析(Task 2,往返测试用)
- Produces: `eventToVCalendar` 输出完整同步字段集;新增内部 `stripMailto(s: string): string`

- [x] **Step 1: 写失败测试**

在 `tests/core/ical-gen.test.ts` 末尾追加:

```ts
describe("eventToVCalendar — extended push fields", () => {
  it("emits DESCRIPTION with escaping (newline/semicolon/comma/backslash)", () => {
    const ics = eventToVCalendar(base({ description: "第一行\n第二行;含,标点\\尾" }));
    expect(ics).toContain("DESCRIPTION:第一行\\n第二行\\;含\\,标点\\\\尾");
    expect(icalToEvents(ics, "test")[0].description).toBe("第一行\n第二行;含,标点\\尾");
  });

  it("emits ORGANIZER/ATTENDEE with exactly one mailto: prefix even if the value already has one", () => {
    const ics = eventToVCalendar(
      base({ organizer: "mailto:alice@example.com", attendees: ["bob@example.com", "mailto:carol@example.com"] }),
    );
    expect(ics).toContain("ORGANIZER:mailto:alice@example.com");
    expect(ics).not.toContain("mailto:mailto:");
    expect(ics).toContain("ATTENDEE:mailto:bob@example.com");
    expect(ics).toContain("ATTENDEE:mailto:carol@example.com");
  });

  it("emits STATUS uppercased; model stays lowercase", () => {
    const ics = eventToVCalendar(base({ status: "tentative" }));
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(icalToEvents(ics, "test")[0].status).toBe("tentative");
  });

  it("emits CATEGORIES escaped (a comma stays a single value)", () => {
    const ics = eventToVCalendar(base({ category: "a, b" }));
    expect(ics).toContain("CATEGORIES:a\\, b");
    expect(icalToEvents(ics, "test")[0].category).toBe("a, b");
  });

  it("emits RRULE raw (no TEXT escaping; BYDAY keeps its comma)", () => {
    const ics = eventToVCalendar(base({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" }));
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(icalToEvents(ics, "test")[0].rrule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  });

  it("omits every extended field when unset (byte-compatible with the pre-extension output)", () => {
    const ics = eventToVCalendar(base({}));
    for (const k of ["DESCRIPTION", "ORGANIZER", "ATTENDEE", "STATUS", "CATEGORIES", "RRULE"]) {
      expect(ics).not.toContain(k);
    }
  });

  it("full round-trip: every synced field survives eventToVCalendar → icalToEvents", () => {
    const ev = base({
      end: "2026-07-14T08:00:00Z",
      location: "会议室A",
      description: "备注\n第二行",
      organizer: "alice@example.com",
      attendees: ["bob@example.com", "carol@example.com"],
      status: "confirmed",
      category: "工作",
      rrule: "FREQ=DAILY;COUNT=3",
    });
    const back = icalToEvents(eventToVCalendar(ev), "test")[0];
    expect(back.title).toBe(ev.title);
    expect(back.start).toContain("2026-07-14T07:00:00");
    expect(back.end).toContain("2026-07-14T08:00:00");
    expect(back.location).toBe(ev.location);
    expect(back.description).toBe(ev.description);
    expect(back.organizer).toBe(ev.organizer);
    expect(back.attendees).toEqual(ev.attendees);
    expect(back.status).toBe(ev.status);
    expect(back.category).toBe(ev.category);
    expect(back.rrule).toBe(ev.rrule);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/core/ical-gen.test.ts`
Expected: FAIL(DESCRIPTION/ORGANIZER/… 未输出)

- [x] **Step 3: 实现 `src/core/ical-gen.ts`**

3a. `normalizeSeparator` 之前插入:

```ts
/** Strips a leading "mailto:" (any case) so a user-typed value never gets double-prefixed. */
function stripMailto(s: string): string {
  return s.replace(/^mailto:/i, "");
}
```

3b. `eventToVCalendar` 中,`if (ev.location) ...` 一行之后插入:

```ts
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
```

3c. timed/all-day 分支结束之后、`lines.push("END:VEVENT", "END:VCALENDAR");` 之前插入:

```ts
  if (ev.organizer) lines.push(`ORGANIZER:mailto:${stripMailto(ev.organizer)}`);
  for (const a of ev.attendees ?? []) lines.push(`ATTENDEE:mailto:${stripMailto(a)}`);
  if (ev.status) lines.push(`STATUS:${ev.status.toUpperCase()}`);
  if (ev.category) lines.push(`CATEGORIES:${escapeText(ev.category)}`);
  // RRULE is a structured value, not TEXT: no escapeText (BYDAY lists carry commas).
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
```

- [x] **Step 4: 跑测试确认通过 + 全量绿**

Run: `npx vitest run tests/core/ical-gen.test.ts && npm test`
Expected: PASS;全量通过

- [x] **Step 5: Commit**

```bash
git add src/core/ical-gen.ts tests/core/ical-gen.test.ts
git commit -m "feat(ical-gen): push DESCRIPTION/ORGANIZER/ATTENDEE/STATUS/CATEGORIES/RRULE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 转换层补全 — fieldsToEvent(plan.ts)+ localToEvent(agenda-panel)

**Files:**
- Modify: `src/sync/plan.ts:20-34`(`fieldsToEvent`)
- Modify: `src/agenda-panel/local-to-event.ts`
- Test: `tests/sync/plan.test.ts`
- Test: `tests/agenda-panel/local-to-event.test.ts`

**Interfaces:**
- Consumes: `unescapeMultiline`(Task 1)、扩展后的 `hashEvent`(Task 1)
- Produces: `fieldsToEvent` 重建完整同步字段集(推送载荷 + 哈希输入同源);`localToEvent` 带 `description`(面板编辑往返)

- [x] **Step 1: 写失败测试**

1a. `tests/sync/plan.test.ts` 末尾追加:

```ts
describe("fieldsToEvent — extended synced fields", () => {
  it("reconstructs description (unescaped)/organizer/attendees/status/category from md fields", () => {
    const ev = fieldsToEvent({
      uid: "u", title: "会", start: "2026-07-14T15:00:00",
      description: "第一行\\n第二行", organizer: "a@x", attendees: "a@x, b@x",
      status: "confirmed", category: "工作",
    });
    expect(ev.description).toBe("第一行\n第二行");
    expect(ev.organizer).toBe("a@x");
    expect(ev.attendees).toEqual(["a@x", "b@x"]);
    expect(ev.status).toBe("confirmed");
    expect(ev.category).toBe("工作");
  });

  it("a pushUpdate payload carries the extended fields (they reach eventToVCalendar intact)", () => {
    const s = serverEvent({ description: "旧", organizer: "a@x", status: "confirmed", category: "工作" });
    const l = mkLocal(s);
    l.fields.description = "新备注\\n第二行";
    const plan = planSync([s], [l]);
    expect(plan.pushUpdate).toHaveLength(1);
    expect(plan.pushUpdate[0].description).toBe("新备注\n第二行");
    expect(plan.pushUpdate[0].organizer).toBe("a@x");
    expect(plan.pushUpdate[0].status).toBe("confirmed");
    expect(plan.pushUpdate[0].category).toBe("工作");
  });

  it("no-op for a fully-populated event whose base_hash matches (extended hash is consistent end-to-end)", () => {
    const s = serverEvent({
      description: "备注", organizer: "a@x", attendees: ["b@x"], status: "confirmed", category: "工作",
    });
    const plan = planSync([s], [mkLocal(s)]);
    expect(plan.pushUpdate).toEqual([]);
    expect(plan.applyServer).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });
});
```

注意需在 `tests/sync/plan.test.ts` 顶部 import 补上 `fieldsToEvent`:`import { planSync, fieldsToEvent } from "../../src/sync/plan";`(替换现有 `import { planSync } ...` 行)。

1b. `tests/agenda-panel/local-to-event.test.ts` 末尾追加:

```ts
it("unescapes a stored single-line description back to multi-line", () => {
  const l = syncedLocal();
  l.fields.description = "第一行\\n第二行";
  expect(localToEvent(l).description).toBe("第一行\n第二行");
});

it("description is undefined when the field is absent", () => {
  expect(localToEvent(syncedLocal()).description).toBeUndefined();
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/sync/plan.test.ts tests/agenda-panel/local-to-event.test.ts`
Expected: FAIL(fieldsToEvent/localToEvent 尚无 description 等字段)

- [x] **Step 3: 实现**

3a. `src/sync/plan.ts`:`import { AgendaEvent, hashEvent } from "../core/event";` 改为:

```ts
import { AgendaEvent, hashEvent, unescapeMultiline } from "../core/event";
```

`fieldsToEvent` 整个替换为:

```ts
/** Reconstructs the calendar-writable fields (+ sync metadata) of an AgendaEvent from a monthly-doc block. */
export function fieldsToEvent(fields: Record<string, string>): AgendaEvent {
  const attendees = (fields["attendees"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    uid: fields["uid"] ?? "",
    title: fields["title"] ?? "",
    start: fields["start"] ?? "",
    end: fields["end"],
    allDay: fields["all_day"] === undefined ? undefined : fields["all_day"] === "true",
    tz: fields["tz"],
    location: fields["location"],
    description: fields["description"] ? unescapeMultiline(fields["description"]) : undefined,
    organizer: fields["organizer"],
    attendees: attendees.length ? attendees : undefined,
    status: fields["status"],
    category: fields["category"],
    origin: fields["origin"] === "synced" ? "synced" : "local",
    href: fields["href"],
    etag: fields["etag"],
    baseHash: fields["base_hash"],
  };
}
```

3b. `src/agenda-panel/local-to-event.ts`:import 行改为 `import { AgendaEvent, unescapeMultiline } from "../core/event";`,并在 `rrule: f.rrule,` 之后插入:

```ts
    description: f.description ? unescapeMultiline(f.description) : undefined,
```

- [x] **Step 4: 跑测试确认通过 + 全量绿**

Run: `npx vitest run tests/sync/plan.test.ts tests/agenda-panel/local-to-event.test.ts && npm test`
Expected: PASS;全量通过

- [x] **Step 5: Commit**

```bash
git add src/sync/plan.ts src/agenda-panel/local-to-event.ts tests/sync/plan.test.ts tests/agenda-panel/local-to-event.test.ts
git commit -m "feat(sync): reconstruct extended fields in fieldsToEvent/localToEvent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: monthly-store.ts — sync 字段清除清单 + 面板清除加 description

**Files:**
- Modify: `src/store/monthly-store.ts`
- Test: `tests/store/monthly-store.test.ts`

**Interfaces:**
- Consumes: `upsertEvents` 的 `clearFields` 选项(已有);`eventToFields` 的 description 输出(Task 1)
- Produces:
  - `SYNC_CLEARABLE_FIELDS`(模块内常量,不导出):`["end","location","organizer","attendees","status","category","description","rrule"]`
  - `store.sync` 始终传 `clearFields: SYNC_CLEARABLE_FIELDS`
  - `PANEL_CLEARABLE_FIELDS` 增加 `"description"`

- [x] **Step 1: 写失败测试**

在 `tests/store/monthly-store.test.ts` 末尾追加:

```ts
describe("MonthlyStore.sync — server-authoritative field clearing", () => {
  const full = (uid: string): AgendaEvent => ({
    uid, title: "会", start: "2026-07-14T10:00:00", origin: "synced",
    location: "会议室", description: "备注", organizer: "a@x", attendees: ["b@x"],
    status: "confirmed", category: "工作", rrule: "FREQ=DAILY",
    rsvp: "ACCEPTED", tags: ["本地标签"],
    href: "https://x/a.ics", etag: '"e1"',
  });

  it("deletes synced fields the server no longer has, but never local-only rsvp/tags nor sync metadata", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([full("a@x")]);
    const p = "Agenda/2026-07.md";
    let text = (await fs.read(p))!;
    expect(text).toContain("description:: 备注");
    expect(text).toContain("rsvp:: ACCEPTED");
    expect(text).toContain("tags:: 本地标签");

    // server drops location/description/organizer/attendees/status/category/rrule
    const stripped = full("a@x");
    delete stripped.location; delete stripped.description; delete stripped.organizer;
    delete stripped.attendees; delete stripped.status; delete stripped.category; delete stripped.rrule;
    await store.sync([stripped]);

    text = (await fs.read(p))!;
    for (const gone of ["location::", "description::", "organizer::", "attendees::", "status::", "category::", "rrule::"]) {
      expect(text).not.toContain(gone);
    }
    // local-only fields and sync metadata survive
    expect(text).toContain("rsvp:: ACCEPTED");
    expect(text).toContain("tags:: 本地标签");
    expect(text).toContain("href:: https://x/a.ics");
    expect(text).toContain("etag::");
  });

  it("still updates fields the server DOES send (clearing does not break normal updates)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([full("a@x")]);
    const updated = { ...full("a@x"), description: "服务器改过的备注", etag: '"e2"' };
    await store.sync([updated]);
    expect(await fs.read("Agenda/2026-07.md")).toContain("description:: 服务器改过的备注");
  });
});

describe("MonthlyStore.savePanelEvent — description is panel-clearable", () => {
  it("clears a blanked description", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const ev: AgendaEvent = {
      uid: "a@x", title: "会", start: "2026-07-14T10:00:00", origin: "synced",
      href: "https://x/a.ics", description: "旧备注",
    };
    await store.savePanelEvent(ev);
    const p = "Agenda/2026-07.md";
    expect(await fs.read(p)).toContain("description:: 旧备注");

    await store.savePanelEvent({ ...ev, description: undefined });
    const text = (await fs.read(p))!;
    expect(text).not.toContain("旧备注");
    expect(text).toContain("href:: https://x/a.ics");
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/store/monthly-store.test.ts`
Expected: FAIL(sync 不清字段 → `location::` 等仍存在的断言失败)

- [x] **Step 3: 实现 `src/store/monthly-store.ts`**

3a. `PANEL_CLEARABLE_FIELDS` 一行替换为:

```ts
/** Optional fields the panel edit form owns — blanking one should delete it. Metadata is never here. */
const PANEL_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "rsvp", "category", "tags", "description"];
```

3b. 其后插入:

```ts
/**
 * Server-authoritative optional fields: when a synced server event no longer carries one,
 * the local md field is deleted on apply (otherwise the stale value's hash would differ from
 * the server-based base_hash and ogenda would "push the ghost back", fighting other devices).
 * Local-only fields (rsvp/tags) and ALL sync metadata (etag/href/base_hash/...) are never here.
 */
const SYNC_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "category", "description", "rrule"];
```

3c. `sync()` 中 `const r = upsertEvents(seed, monthEvents);` 替换为:

```ts
      const r = upsertEvents(seed, monthEvents, { clearFields: SYNC_CLEARABLE_FIELDS });
```

- [x] **Step 4: 跑测试确认通过 + 全量绿**

Run: `npx vitest run tests/store/monthly-store.test.ts && npm test`
Expected: PASS;全量通过(注意既有用例 `tests/core/upsert-clear.test.ts` 直接测 `upsertEvents` 不传 clearFields 的行为,不受影响)

- [x] **Step 5: Commit**

```bash
git add src/store/monthly-store.ts tests/store/monthly-store.test.ts
git commit -m "feat(monthly-store): clear server-dropped synced fields on sync; panel can clear description

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 表单 — description 字段 + Enter 守卫 + 标题铺满 + i18n + CSS

**Files:**
- Modify: `src/agenda-panel/event-form-fields.ts`
- Modify: `src/agenda-panel/event-form-modal.ts`
- Modify: `src/i18n/zh.ts`(`"form.tags.name"` 行之后)
- Modify: `src/i18n/en.ts`(同位置)
- Modify: `styles.css`(`.ogenda-form-datetime` 规则之后)
- Test: `tests/agenda-panel/event-form-fields.test.ts`
- Test: `tests/agenda-panel/local-to-event.test.ts`(仅 blankFields 补一键)

**Interfaces:**
- Consumes: `AgendaEvent.description`(Task 1);`localToEvent` 的 description(Task 4,编辑往返)
- Produces:
  - `RawFormFields.description: string`
  - `shouldSaveOnEnter(key: string, isComposing: boolean, targetIsTextarea: boolean, saveDisabled: boolean): boolean`
  - 表单:标题行 class `ogenda-form-title`;备注 textarea(行 class `ogenda-form-desc-row`,textarea class `ogenda-form-desc`),位于「标签」之后、「更多选项」之前
  - i18n 键 `form.description.name`(zh 备注 / en Notes)

- [x] **Step 1: 写失败测试**

1a. `tests/agenda-panel/event-form-fields.test.ts` 与 `tests/agenda-panel/local-to-event.test.ts` 两个文件中的 `blankFields` 都补上 `description: ""`(RawFormFields 新增必填键,先对齐测试助手):

```ts
const blankFields = (): RawFormFields => ({
  title: "", start: "", end: "", allDay: false,
  location: "", organizer: "", attendees: "",
  status: "", rsvp: "", category: "", tags: "", description: "",
});
```

1b. `tests/agenda-panel/event-form-fields.test.ts` 末尾追加:

```ts
describe("buildEventFromFields — description", () => {
  it("carries description, trimmed", () => {
    const ev = buildEventFromFields(baseFields({ description: "  备注内容\n第二行  " }), null, () => "uid1");
    expect(ev.description).toBe("备注内容\n第二行");
  });
  it("empty/blank description → undefined", () => {
    expect(buildEventFromFields(baseFields({ description: "   " }), null, () => "uid1").description).toBeUndefined();
    expect(buildEventFromFields(baseFields({}), null, () => "uid1").description).toBeUndefined();
  });
  it("editing an event whose fields keep a description does not lose it", () => {
    const existing = buildEventFromFields(baseFields({ description: "旧备注" }), null, () => "uid1");
    const saved = buildEventFromFields(baseFields({ description: existing.description! }), existing, () => "uid2");
    expect(saved.description).toBe("旧备注");
  });
});

describe("shouldSaveOnEnter", () => {
  it("saves on Enter when not composing, not in a textarea, and save is enabled", () => {
    expect(shouldSaveOnEnter("Enter", false, false, false)).toBe(true);
  });
  it("does not save on a non-Enter key", () => {
    expect(shouldSaveOnEnter("a", false, false, false)).toBe(false);
  });
  it("does not save while IME-composing", () => {
    expect(shouldSaveOnEnter("Enter", true, false, false)).toBe(false);
  });
  it("does not save inside the description textarea (Enter = newline there)", () => {
    expect(shouldSaveOnEnter("Enter", false, true, false)).toBe(false);
  });
  it("does not save while the save button is disabled", () => {
    expect(shouldSaveOnEnter("Enter", false, false, true)).toBe(false);
  });
});
```

(`baseFields` 是该文件已有的测试助手,签名 `baseFields(over?: Partial<RawFormFields>)`;若其对象字面量未含 `description`,同样补 `description: ""`。)

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts tests/agenda-panel/local-to-event.test.ts`
Expected: FAIL(`shouldSaveOnEnter is not a function`)

- [x] **Step 3: 实现**

3a. `src/agenda-panel/event-form-fields.ts`:
- `RawFormFields` 接口 `tags: string;` 之后加 `description: string;`
- `buildEventFromFields` 返回对象中 `category,` 之后加 `description: fields.description.trim() || undefined,`
- 文件末尾追加:

```ts
/** Enter saves the form — except during IME composition, inside the multi-line textarea, or when save is disabled. */
export function shouldSaveOnEnter(
  key: string,
  isComposing: boolean,
  targetIsTextarea: boolean,
  saveDisabled: boolean,
): boolean {
  return key === "Enter" && !isComposing && !targetIsTextarea && !saveDisabled;
}
```

3b. `src/agenda-panel/event-form-modal.ts`:
- import 块 `from "./event-form-fields"` 的列表中 `RSVP_OPTIONS,` 之后加 `shouldSaveOnEnter,`
- 构造器 `this.fields` 字面量中 `tags: existing?.tags?.join(", ") ?? "",` 之后加 `description: existing?.description ?? "",`
- 标题 Setting(第 59-65 行)改为持有引用并加 class:

```ts
    const titleSetting = new Setting(contentEl).setName(t("form.title.name") + " *").addText((tx) => {
      this.titleInput = tx.inputEl;
      tx.setValue(this.fields.title).onChange((v) => {
        this.fields.title = v;
        this.updateValidity();
      });
    });
    titleSetting.settingEl.addClass("ogenda-form-title");
```

- 标签 Setting(第 107-110 行)之后、`const moreToggle = ...` 之前插入备注 textarea:

```ts
    const descSetting = new Setting(contentEl).setName(t("form.description.name")).addTextArea((tx) => {
      tx.setValue(this.fields.description).onChange((v) => (this.fields.description = v));
      tx.inputEl.addClass("ogenda-form-desc");
    });
    descSetting.settingEl.addClass("ogenda-form-desc-row");
```

- keydown 处理器(第 169-174 行)替换为:

```ts
    contentEl.addEventListener("keydown", (e) => {
      if (shouldSaveOnEnter(e.key, e.isComposing, e.target instanceof HTMLTextAreaElement, this.saveBtn.disabled)) {
        e.preventDefault();
        this.handleSave();
      }
    });
```

3c. `src/i18n/zh.ts` `"form.tags.name": "标签",` 之后加:

```ts
  "form.description.name": "备注",
```

3d. `src/i18n/en.ts` `"form.tags.name": "Tags",` 之后加:

```ts
  "form.description.name": "Notes",
```

3e. `styles.css` `.ogenda-form-datetime { width: 100%; }` 规则之后追加:

```css
.ogenda-form-title .setting-item-control,
.ogenda-form-desc-row .setting-item-control {
  flex-grow: 1;
}
.ogenda-form-title input[type="text"] {
  width: 100%;
}
textarea.ogenda-form-desc {
  width: 100%;
  min-height: 5em;
  resize: vertical;
}
```

- [x] **Step 4: 验证 — 单测全绿 + build 干净 + 产物含新 class**

Run: `npm test && npm run build && grep -c "ogenda-form-desc" main.js styles.css`
Expected: 测试全过;build 无错;grep 两个文件各 ≥1(main.js 中 class 名是 ASCII,esbuild 不会转义)

- [x] **Step 5: Commit**

```bash
git add src/agenda-panel/event-form-fields.ts src/agenda-panel/event-form-modal.ts src/i18n/zh.ts src/i18n/en.ts styles.css tests/agenda-panel/event-form-fields.test.ts tests/agenda-panel/local-to-event.test.ts main.js
git commit -m "feat(event-form): description textarea, Enter guard in textarea, full-width title input

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(仓库若未跟踪 main.js 则从 add 列表去掉;以 `git status` 实际为准。)

---

## Self-Review 结论

- **Spec 覆盖**:A1 模型/存储→T1;A2 拉取→T2;A3 推送→T3;A4 表单+A5 i18n→T6;B 推送补全→T3;C 解析补全→T2;D1 哈希→T1;D2 fieldsToEvent→T4;D3 localToEvent→T4;D4 sync 清除→T5;D5 stats 自动跟随(无需任务,已核实其复用 fieldsToEvent+hashEvent);E 标题铺满→T6。真机验收清单属合并后步骤,不占任务。
- **哈希升级安全性**:T1 的 legacyHash 对照测试钉住「无新字段事件哈希不变」。
- **类型一致性**:`escapeMultiline`/`unescapeMultiline`(T1 产出,T4 消费)、`shouldSaveOnEnter` 四参数签名(T6 内部自洽)、`SYNC_CLEARABLE_FIELDS`(T5 内部常量)均已交叉核对。
- **测试助手同步**:`event-form-fields.test.ts` 的 `blankFields`/`baseFields` 与 `local-to-event.test.ts` 的 `blankFields` 补 `description: ""` 已在 T6 Step 1a/1b 显式列出,避免越权改文件争议。
