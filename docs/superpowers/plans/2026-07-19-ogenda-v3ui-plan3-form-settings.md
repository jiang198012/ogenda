# ogenda v3-UI 计划三:表单交互 + 写入修复 + 设置分类色覆盖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修掉 v3-UI 的功能痛点——表单改用原生日期时间选择器(#51,根治手打易错)、修 +新建默认全天 bug(#52)、支持编辑时清空可选字段(#53)、全天零长度校验(#54);并在设置里加"分类色手动覆盖"UI(接线到计划一的配色 resolver)。

**Architecture:** 纯函数集中在 `event-form-fields.ts`(ISO ↔ 原生控件值互转、初始 start 推导、扩展校验),`EventFormModal` 用原生 `<input type="datetime-local|date">` 并接受显式 `defaultAllDay`。#53 在 `monthly-doc.ts` 的 `upsertEvents` 加 `clearFields` 选项(删除本次未填、但属可写字段集合的键),`MonthlyStore` 加 `savePanelEvent()` 走这条"可删字段"写路径;**不动** `sync()` 的合并语义(保护 href/etag)。设置页新增分类色覆盖编辑器,写入 `settings.categoryColors`,由 `main.ts` 传入面板,`render()` 用 `createColorResolver(this.categoryColors)`。

**Tech Stack:** TypeScript、Obsidian API(Setting/ColorPicker/原生 input)、vitest + jsdom、esbuild。

**依赖:** 需先完成**计划一**(`colors.ts` 的 `createColorResolver`;面板 `render()` 内 `const colors = createColorResolver({})` 已存在,本计划 Task 3 改为读 `this.categoryColors`)。与计划二无耦合,可在计划一之后、计划二之前或之后实施。

## Global Constraints

- **minAppVersion 维持 `1.5.0`**——原生 `<input type="datetime-local|date">` 是标准 HTML,Electron 支持,无版本顾虑;`addColorPicker`/`addExtraButton` 均为 ≥1.5.0 稳定 API。
- **不改 `sync()` / `upsertEvents` 默认合并语义**(不传 `clearFields` 时行为与现状完全一致,保护 href/etag/base_hash)。
- **#52 决策**:顶部"+新建"与空白格点击都传 `defaultAllDay = false`(情境默认=带时间);编辑既有事件时以 `existing.allDay` 为准。
- **#53 可清空字段集合**(仅用户可编辑的可选字段,绝不含元数据):`["end","location","organizer","attendees","status","rsvp","category","tags"]`。
- **测试命令** `node node_modules/vitest/vitest.mjs run <path>`;**构建** `npm run build`。
- **提交信息末尾**:`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: 表单原生日期时间选择器(#51)+ 默认全天修复(#52)+ 全天零长度校验(#54)

**Files:**
- Modify: `src/agenda-panel/event-form-fields.ts`
- Modify(追加用例): `tests/agenda-panel/event-form-fields.test.ts`
- Modify(整体重写): `src/agenda-panel/event-form-modal.ts`
- Modify(3 处调用): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `AgendaEvent`(既有)、`generateUid`(既有)。
- Produces(纯函数):
  - `isoToDatetimeLocalValue(iso): string` / `datetimeLocalValueToIso(v): string`
  - `isoToDateValue(iso): string` / `dateValueToIso(v): string`
  - `initialStart(prefill: string, allDay: boolean): string`
  - `validateEventForm(fields: { title; start; end?; allDay? }): ValidationResult`(扩展:全天 `end<=start` 报错)
  - `EventFormModal` 构造签名新增 `defaultAllDay: boolean`(位于 `prefillStart` 之后、`existingCategories` 之前)。

- [ ] **Step 1: 追加失败测试(转换 + initialStart + #54 校验)**

在 `tests/agenda-panel/event-form-fields.test.ts`:

① 顶部 import 替换为:

```ts
import {
  validateEventForm,
  buildEventFromFields,
  RawFormFields,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
  isoToDateValue,
  dateValueToIso,
  initialStart,
} from "../../src/agenda-panel/event-form-fields";
```

② 在 `describe("validateEventForm", ...)` 内追加:

```ts
  it("rejects an all-day event whose end is on or before the start (zero-length, #54)", () => {
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-14", allDay: true }).valid).toBe(false);
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-13", allDay: true }).valid).toBe(false);
  });
  it("accepts an all-day event whose end is the next day (exclusive)", () => {
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-15", allDay: true }).valid).toBe(true);
  });
  it("does not apply the all-day end rule to timed events", () => {
    expect(
      validateEventForm({ title: "x", start: "2026-07-14T10:00:00", end: "2026-07-14T09:00:00", allDay: false }).valid,
    ).toBe(true);
  });
```

③ 文件末尾追加两个 describe:

```ts
describe("datetime field conversions (#51)", () => {
  it("isoToDatetimeLocalValue: ISO datetime → minute-precision local value", () => {
    expect(isoToDatetimeLocalValue("2026-07-14T15:00:00")).toBe("2026-07-14T15:00");
  });
  it("isoToDatetimeLocalValue: date-only → midnight local value", () => {
    expect(isoToDatetimeLocalValue("2026-07-14")).toBe("2026-07-14T00:00");
  });
  it("isoToDatetimeLocalValue: tolerates a lowercase t separator", () => {
    expect(isoToDatetimeLocalValue("2026-07-14t15:00:00")).toBe("2026-07-14T15:00");
  });
  it("datetimeLocalValueToIso: local value → ISO datetime with seconds", () => {
    expect(datetimeLocalValueToIso("2026-07-14T15:00")).toBe("2026-07-14T15:00:00");
  });
  it("isoToDateValue: datetime or date → date-only", () => {
    expect(isoToDateValue("2026-07-14T15:00:00")).toBe("2026-07-14");
    expect(isoToDateValue("2026-07-14")).toBe("2026-07-14");
  });
  it("dateValueToIso: date value → date-only ISO", () => {
    expect(dateValueToIso("2026-07-14")).toBe("2026-07-14");
  });
});

describe("initialStart (#52)", () => {
  it("all-day → date-only", () => {
    expect(initialStart("2026-07-14", true)).toBe("2026-07-14");
  });
  it("timed with a date-only prefill → injects a 09:00 default", () => {
    expect(initialStart("2026-07-14", false)).toBe("2026-07-14T09:00:00");
  });
  it("timed with a datetime prefill → keeps the time", () => {
    expect(initialStart("2026-07-14T15:30:00", false)).toBe("2026-07-14T15:30:00");
  });
  it("empty prefill → empty", () => {
    expect(initialStart("", false)).toBe("");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/event-form-fields.test.ts`
Expected: FAIL(转换/`initialStart` 未导出;全天校验规则未实现)。

- [ ] **Step 3: 整体重写 event-form-fields.ts**

整体替换 `src/agenda-panel/event-form-fields.ts`:

```ts
import { AgendaEvent } from "../core/event";

export interface RawFormFields {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string;
  status: string;
  rsvp: string;
  categoryDropdown: string;
  categoryText: string;
  tags: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Normalize a lowercase "t" date/time separator (a legacy typo) to uppercase "T". */
function normSep(s: string): string {
  return s.replace(/^(\d{4}-\d{2}-\d{2})[tT]/, "$1T");
}

/** ISO (date or datetime) → <input type="datetime-local"> value "YYYY-MM-DDTHH:mm". */
export function isoToDatetimeLocalValue(iso: string): string {
  const s = normSep(iso.trim());
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 16);
  return `${s.slice(0, 10)}T00:00`;
}

/** <input type="datetime-local"> value → ISO datetime with seconds. */
export function datetimeLocalValueToIso(v: string): string {
  const s = normSep(v.trim());
  if (!s) return "";
  if (!s.includes("T")) return `${s.slice(0, 10)}T00:00:00`;
  return `${s.slice(0, 16)}:00`;
}

/** ISO (date or datetime) → <input type="date"> value "YYYY-MM-DD". */
export function isoToDateValue(iso: string): string {
  return normSep(iso.trim()).slice(0, 10);
}

/** <input type="date"> value → date-only ISO. */
export function dateValueToIso(v: string): string {
  return v.trim().slice(0, 10);
}

/** Seed value for a new event's start field, honoring the all-day default. */
export function initialStart(prefill: string, allDay: boolean): string {
  const p = normSep(prefill.trim());
  if (p === "") return "";
  if (allDay) return isoToDateValue(p);
  if (p.includes("T")) return datetimeLocalValueToIso(p);
  return `${isoToDateValue(p)}T09:00:00`;
}

export function validateEventForm(fields: {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
}): ValidationResult {
  const errors: string[] = [];
  if (!fields.title.trim()) errors.push("标题不能为空");
  if (!fields.start.trim()) errors.push("开始时间不能为空");
  if (fields.allDay && fields.end && fields.end.trim()) {
    const s = isoToDateValue(fields.start);
    const e = isoToDateValue(fields.end);
    if (e <= s) errors.push("全天事件结束日期需晚于开始日期(次日为排他)");
  }
  return { valid: errors.length === 0, errors };
}

function splitList(s: string): string[] | undefined {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function buildEventFromFields(
  fields: RawFormFields,
  existing: AgendaEvent | null,
  generateUid: () => string,
): AgendaEvent {
  const category = fields.categoryText.trim() || fields.categoryDropdown || undefined;
  return {
    uid: existing?.uid ?? generateUid(),
    title: fields.title.trim(),
    start: fields.start.trim(),
    end: fields.end.trim() || undefined,
    allDay: fields.allDay,
    location: fields.location.trim() || undefined,
    organizer: fields.organizer.trim() || undefined,
    attendees: splitList(fields.attendees),
    status: fields.status || undefined,
    rsvp: fields.rsvp.trim() || undefined,
    category,
    tags: splitList(fields.tags),
    origin: existing?.origin ?? "local",
    href: existing?.href,
    etag: existing?.etag,
    baseHash: existing?.baseHash,
    rrule: existing?.rrule,
    tz: existing?.tz,
    url: existing?.url,
    busy: existing?.busy,
    source: existing?.source,
    protocol: existing?.protocol,
    serverDeleted: existing?.serverDeleted,
    seq: existing?.seq,
    lastSynced: existing?.lastSynced,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/agenda-panel/event-form-fields.test.ts`
Expected: PASS(既有用例 + 新增转换/initialStart/#54 用例)。

- [ ] **Step 5: 整体重写 event-form-modal.ts(原生控件 + defaultAllDay + initialStart)**

整体替换 `src/agenda-panel/event-form-modal.ts`:

```ts
import { App, Modal, Setting } from "obsidian";
import { AgendaEvent } from "../core/event";
import { generateUid } from "./uid";
import {
  validateEventForm,
  buildEventFromFields,
  RawFormFields,
  initialStart,
  isoToDateValue,
  isoToDatetimeLocalValue,
  dateValueToIso,
  datetimeLocalValueToIso,
} from "./event-form-fields";

export class EventFormModal extends Modal {
  private fields: RawFormFields;
  private errorEl: HTMLElement | null = null;
  private startInput!: HTMLInputElement;
  private endInput!: HTMLInputElement;

  constructor(
    app: App,
    private existing: AgendaEvent | null,
    prefillStart: string | undefined,
    defaultAllDay: boolean,
    private existingCategories: string[],
    private onSubmit: (event: AgendaEvent) => void,
    private onViewInNote: (() => void) | undefined,
    private onDelete: (() => void) | undefined,
  ) {
    super(app);
    const isKnownCategory = existing?.category !== undefined && existingCategories.includes(existing.category);
    const allDay = existing?.allDay ?? defaultAllDay;
    this.fields = {
      title: existing?.title ?? "",
      start: existing?.start ?? initialStart(prefillStart ?? "", allDay),
      end: existing?.end ?? "",
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      categoryDropdown: isKnownCategory ? existing!.category! : "",
      categoryText: existing?.category && !isKnownCategory ? existing.category : "",
      tags: existing?.tags?.join(", ") ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(this.existing ? "编辑事件" : "新建事件");
    const { contentEl } = this;

    new Setting(contentEl).setName("标题").addText((t) =>
      t.setValue(this.fields.title).onChange((v) => (this.fields.title = v)),
    );
    new Setting(contentEl).setName("全天").addToggle((tg) =>
      tg.setValue(this.fields.allDay).onChange((v) => {
        // Preserve entered values across the input-type switch (read with the OLD allDay first).
        this.fields.start = this.readDateInput(this.startInput);
        this.fields.end = this.readDateInput(this.endInput);
        this.fields.allDay = v;
        this.applyDateInputs();
      }),
    );

    const startRow = new Setting(contentEl).setName("开始时间");
    this.startInput = startRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    const endRow = new Setting(contentEl).setName("结束时间").setDesc("可留空(全天填次日,排他)");
    this.endInput = endRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    this.applyDateInputs();
    this.startInput.addEventListener("change", () => (this.fields.start = this.readDateInput(this.startInput)));
    this.endInput.addEventListener("change", () => (this.fields.end = this.readDateInput(this.endInput)));

    new Setting(contentEl).setName("地点").addText((t) =>
      t.setValue(this.fields.location).onChange((v) => (this.fields.location = v)),
    );
    new Setting(contentEl).setName("组织者").addText((t) =>
      t.setValue(this.fields.organizer).onChange((v) => (this.fields.organizer = v)),
    );
    new Setting(contentEl)
      .setName("参与人")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.attendees).onChange((v) => (this.fields.attendees = v)));
    new Setting(contentEl).setName("状态").addDropdown((d) =>
      d
        .addOption("", "(未设置)")
        .addOption("confirmed", "confirmed")
        .addOption("tentative", "tentative")
        .addOption("cancelled", "cancelled")
        .setValue(this.fields.status)
        .onChange((v) => (this.fields.status = v)),
    );
    new Setting(contentEl).setName("RSVP").addText((t) =>
      t.setValue(this.fields.rsvp).onChange((v) => (this.fields.rsvp = v)),
    );
    new Setting(contentEl)
      .setName("分类")
      .setDesc("下拉选已有分类")
      .addDropdown((d) => {
        d.addOption("", "(未设置)");
        for (const c of this.existingCategories) d.addOption(c, c);
        d.setValue(this.fields.categoryDropdown);
        d.onChange((v) => (this.fields.categoryDropdown = v));
      });
    new Setting(contentEl)
      .setName("新分类")
      .setDesc("可选,填了就优先用这个而不是上面的下拉选择")
      .addText((t) => t.setValue(this.fields.categoryText).onChange((v) => (this.fields.categoryText = v)));
    new Setting(contentEl)
      .setName("标签")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.tags).onChange((v) => (this.fields.tags = v)));

    this.errorEl = contentEl.createDiv({ cls: "ogenda-form-error" });

    const buttonRow = contentEl.createDiv({ cls: "ogenda-form-buttons" });
    if (this.existing && this.onViewInNote) {
      const viewBtn = buttonRow.createEl("button", { text: "在笔记中查看" });
      viewBtn.addEventListener("click", () => {
        this.close();
        this.onViewInNote!();
      });
    }
    if (this.existing && this.onDelete) {
      const delBtn = buttonRow.createEl("button", { text: "删除" });
      delBtn.addEventListener("click", () => {
        this.close();
        this.onDelete!();
      });
    }
    const saveBtn = buttonRow.createEl("button", { text: "保存", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.handleSave());
  }

  private applyDateInputs(): void {
    if (this.fields.allDay) {
      this.startInput.type = "date";
      this.endInput.type = "date";
      this.startInput.value = isoToDateValue(this.fields.start);
      this.endInput.value = this.fields.end ? isoToDateValue(this.fields.end) : "";
    } else {
      this.startInput.type = "datetime-local";
      this.endInput.type = "datetime-local";
      this.startInput.value = isoToDatetimeLocalValue(this.fields.start);
      this.endInput.value = this.fields.end ? isoToDatetimeLocalValue(this.fields.end) : "";
    }
  }

  private readDateInput(input: HTMLInputElement): string {
    const v = input.value;
    if (!v) return "";
    return this.fields.allDay ? dateValueToIso(v) : datetimeLocalValueToIso(v);
  }

  private handleSave(): void {
    this.fields.start = this.readDateInput(this.startInput);
    this.fields.end = this.readDateInput(this.endInput);
    const result = validateEventForm(this.fields);
    if (!result.valid) {
      if (this.errorEl) this.errorEl.setText(result.errors.join("; "));
      return;
    }
    const event = buildEventFromFields(this.fields, this.existing, generateUid);
    this.close();
    this.onSubmit(event);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 6: 更新面板 3 处 EventFormModal 调用(补 defaultAllDay=false)**

在 `src/agenda-panel/agenda-panel-view.ts`,三处 `new EventFormModal(...)` 均在 `prefillStart` 之后插入一个 `false` 实参:

① 顶部"+新建"(`newBtn` 回调):

```ts
        new EventFormModal(
          this.app,
          null,
          toDateKey(this.anchor),
          false,
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
```

② 点击既有事件(`onEventClick`):

```ts
        new EventFormModal(
          this.app,
          event,
          undefined,
          false,
          categories,
          (updated) => void this.saveEvent(updated),
          () => void openEventSource(this.app, this.folder, event),
          () => this.confirmDelete(event),
        ).open();
```

③ 点击空白格(`onEmptyClick`):

```ts
        new EventFormModal(
          this.app,
          null,
          toDateKey(day),
          false,
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
```

- [ ] **Step 7: 构建 + 全量测试**

Run: `npm run build`
Expected: 无 TS 报错(3 处调用的参数个数与新构造签名一致)。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿。

- [ ] **Step 8: 真机目测(手动验收)**

真机:点"+新建",确认默认**非全天**、开始时间是原生日期时间选择器(可点日历/时钟选)、初始为今天 09:00;勾"全天"后控件变为纯日期选择器且值保留;全天事件填"结束=开始"时点保存报"结束日期需晚于开始"。

- [ ] **Step 9: 提交**

```bash
git add src/agenda-panel/event-form-fields.ts tests/agenda-panel/event-form-fields.test.ts src/agenda-panel/event-form-modal.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): native datetime pickers (#51) + explicit default-allday (#52) + all-day zero-length validation (#54)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 编辑清空可选字段写入路径(#53)

**Files:**
- Modify: `src/core/monthly-doc.ts`
- Create: `tests/core/upsert-clear.test.ts`
- Modify: `src/store/monthly-store.ts`
- Modify(追加用例): `tests/store/monthly-store.test.ts`
- Modify(接线): `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `upsertEvents`(既有)、`InMemoryFileStore`(既有,测试用)。
- Produces:
  - `upsertEvents(text, events, opts?: { clearFields?: string[] }): UpsertResult` —— 传 `clearFields` 时,对每个事件删除"本次字段里不存在、但在 `clearFields` 列表内"的键;不传时行为与现状完全一致。
  - `MonthlyStore.savePanelEvent(event: AgendaEvent): Promise<SyncSummary>` —— 面板编辑专用写路径,内部用 `clearFields = PANEL_CLEARABLE_FIELDS`。

- [ ] **Step 1: 写 upsert clearFields 失败测试(新文件)**

创建 `tests/core/upsert-clear.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { upsertEvents } from "../../src/core/monthly-doc";
import { AgendaEvent } from "../../src/core/event";

const base: AgendaEvent = { uid: "e1@ogenda", title: "会", start: "2026-07-14T10:00:00", origin: "local" };

describe("upsertEvents clearFields (#53)", () => {
  it("without clearFields, a now-absent optional field is PRESERVED (sync merge semantics)", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, location: "会议室" }]).text;
    const after = upsertEvents(seed, [{ ...base }]).text; // location dropped from the event
    expect(after).toContain("location:: 会议室"); // merge never deletes
  });

  it("with clearFields, a now-absent clearable field is DELETED from the block", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, location: "会议室" }]).text;
    const r = upsertEvents(seed, [{ ...base }], { clearFields: ["location"] });
    expect(r.text).not.toContain("会议室");
    expect(r.updated).toBe(1);
  });

  it("with clearFields, a metadata field NOT in the clearable set is preserved", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, href: "https://x/a.ics", location: "会议室" }]).text;
    const r = upsertEvents(seed, [{ ...base, href: "https://x/a.ics" }], { clearFields: ["location"] });
    expect(r.text).toContain("href:: https://x/a.ics"); // preserved
    expect(r.text).not.toContain("会议室"); // cleared
  });

  it("counts 0 updated when there is nothing to clear and nothing changed", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base }]).text;
    const r = upsertEvents(seed, [{ ...base }], { clearFields: ["location"] });
    expect(r.updated).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/core/upsert-clear.test.ts`
Expected: FAIL(`upsertEvents` 尚不接受第 3 参 `clearFields`;清空用例仍能读到"会议室")。

- [ ] **Step 3: 给 upsertEvents 加 clearFields 选项**

在 `src/core/monthly-doc.ts`,把 `upsertEvents` 整体替换为(仅新增 `opts` 参数与 clear 逻辑,其余不变):

```ts
export function upsertEvents(
  text: string,
  events: AgendaEvent[],
  opts?: { clearFields?: string[] },
): UpsertResult {
  const { preamble, blocks } = parseMonthlyDoc(text);
  const clearable = opts?.clearFields ?? [];
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
      const heading = eventHeading(ev);
      let changed = existing.heading !== heading;
      for (const [k, v] of Object.entries(mf)) {
        if (existing.fields[k] !== v) changed = true;
      }
      for (const k of clearable) {
        if (!(k in mf) && k in existing.fields) changed = true;
      }
      // only rewrite + count as "updated" when the event actually changed
      if (changed) {
        for (const [k, v] of Object.entries(mf)) {
          if (!existing.fieldOrder.includes(k)) existing.fieldOrder.push(k);
          existing.fields[k] = v;
        }
        for (const k of clearable) {
          if (!(k in mf) && k in existing.fields) {
            delete existing.fields[k];
            existing.fieldOrder = existing.fieldOrder.filter((f) => f !== k);
          }
        }
        existing.heading = heading;
        updated++;
      }
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
  blocks.sort((a, b) => {
    const sa = a.fields["start"] || "";
    const sb = b.fields["start"] || "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return { text: serializeMonthlyDoc(preamble, blocks), added, updated };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/core/upsert-clear.test.ts`
Expected: PASS。同时跑既有 upsert/monthly-doc 相关测试确认无回归:
Run: `node node_modules/vitest/vitest.mjs run tests/core`
Expected: 全绿(默认无 `clearFields` 时行为不变)。

- [ ] **Step 5: 写 savePanelEvent 失败测试**

在 `tests/store/monthly-store.test.ts` 末尾追加:

```ts
describe("MonthlyStore.savePanelEvent (#53)", () => {
  it("clears a blanked optional field but preserves sync metadata (href)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const ev: AgendaEvent = {
      uid: "a@x", title: "会", start: "2026-07-14T10:00:00", origin: "synced",
      href: "https://x/a.ics", location: "会议室",
    };
    await store.savePanelEvent(ev);
    const p = "Agenda/2026-07.md";
    expect(await fs.read(p)).toContain("会议室");

    await store.savePanelEvent({ ...ev, location: undefined }); // user cleared location
    const text = (await fs.read(p))!;
    expect(text).not.toContain("会议室");
    expect(text).toContain("href:: https://x/a.ics");
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/store/monthly-store.test.ts`
Expected: FAIL(`store.savePanelEvent` 未定义)。

- [ ] **Step 7: 实现 MonthlyStore.savePanelEvent**

在 `src/store/monthly-store.ts`,在类里(如 `removeByUid` 之前)加常量与方法:

```ts
/** Optional fields the panel edit form owns — blanking one should delete it. Metadata is never here. */
const PANEL_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "rsvp", "category", "tags"];
```
(放在文件顶部 `export function monthOf` 之后的模块作用域即可。)

在 `MonthlyStore` 类内添加方法:

```ts
  /**
   * Panel-edit write path: like sync() for a single event, but blanked optional
   * fields are DELETED (clearFields). Sync's merge semantics (which protect
   * href/etag/base_hash) are intentionally left untouched — see upsertEvents.
   */
  async savePanelEvent(event: AgendaEvent): Promise<SyncSummary> {
    await this.store.ensureFolder(this.folder);
    const month = monthOf(event.start);
    const path = this.pathFor(month);
    const existing = (await this.store.read(path)) ?? "";
    const seed = existing || `# ${month}\n`;
    const r = upsertEvents(seed, [event], { clearFields: PANEL_CLEARABLE_FIELDS });
    if (r.added > 0 || r.updated > 0) {
      await this.store.write(path, r.text);
    }
    return { added: r.added, updated: r.updated, months: r.added > 0 || r.updated > 0 ? [month] : [] };
  }
```

(`upsertEvents` 已在本文件 import。)

- [ ] **Step 8: 接线面板(saveEvent 改走 savePanelEvent)**

在 `src/agenda-panel/agenda-panel-view.ts` 的 `saveEvent`,把 `await this.store.sync([event]);` 改为:

```ts
  private async saveEvent(event: AgendaEvent): Promise<void> {
    await this.store.savePanelEvent(event);
    this.triggerSync();
    await this.render();
  }
```

- [ ] **Step 9: 跑测试 + 构建**

Run: `node node_modules/vitest/vitest.mjs run tests/store/monthly-store.test.ts tests/core/upsert-clear.test.ts`
Expected: PASS。
Run: `npm run build`
Expected: 无报错。

- [ ] **Step 10: 提交**

```bash
git add src/core/monthly-doc.ts tests/core/upsert-clear.test.ts src/store/monthly-store.ts tests/store/monthly-store.test.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): panel clear-fields write path (#53) — upsertEvents clearFields + savePanelEvent, sync merge untouched

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 设置分类色手动覆盖 + 接线面板 resolver

**Files:**
- Modify: `src/settings/settings.ts`
- Modify(更新 + 追加用例): `tests/settings/settings.test.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/main.ts`
- Modify: `src/agenda-panel/agenda-panel-view.ts`

**Interfaces:**
- Consumes: `createColorResolver`(计划一)、Obsidian `Setting.addColorPicker/addExtraButton/addButton`。
- Produces:
  - `OgendaSettings.categoryColors: Record<string, string>`(默认 `{}`,sanitize 只保留字符串值)。
  - 设置页"分类颜色(可选覆盖)"编辑器:列出现有覆盖(颜色选择器 + 移除),可新增。
  - `AgendaPanelView` 构造新增 `categoryColors: Record<string, string>` 参数;`render()` 用 `createColorResolver(this.categoryColors)`。

- [ ] **Step 1: 更新 settings.test.ts(补 categoryColors)**

在 `tests/settings/settings.test.ts`:

① 第一个用例的 `expect(s).toEqual({ ... })` 对象里,追加一行 `categoryColors: {},`(键序不影响 `toEqual`):

```ts
    expect(s).toEqual({
      email: "a@x",
      appPassword: "pw123",
      storageFolder: "Cal",
      scanCount: 10,
      syncOnStartup: true,
      icloudUser: "me@icloud.com",
      icloudAppPassword: "abcd",
      icloudCalUrl: "https://p1-caldav.icloud.com/1/calendars/home/",
      timezone: "",
      categoryColors: {},
    });
```

② 文件末尾 `describe` 内追加新用例:

```ts
  it("keeps a category-colors map, dropping non-string values, defaulting to {}", () => {
    expect(sanitizeSettings({ categoryColors: { 工作: "#4c8dff", 生活: 123 } }).categoryColors).toEqual({
      工作: "#4c8dff",
    });
    expect(sanitizeSettings({}).categoryColors).toEqual({});
    expect(DEFAULT_SETTINGS.categoryColors).toEqual({});
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`
Expected: FAIL(`categoryColors` 尚不存在:`toEqual` 缺键、新用例读到 undefined)。

- [ ] **Step 3: 给 settings.ts 加 categoryColors**

在 `src/settings/settings.ts`:

① `OgendaSettings` 接口末尾加字段:

```ts
  /** Manual category → hex color overrides (auto palette otherwise). */
  categoryColors: Record<string, string>;
```

② `DEFAULT_SETTINGS` 末尾加:

```ts
  categoryColors: {},
```

③ 在 `sanitizeSettings` 里,`bool` 帮助函数下方加一个 map 帮助函数,并在返回对象末尾加 `categoryColors`:

```ts
  const strMap = (v: unknown): Record<string, string> => {
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  };
```
返回对象追加:
```ts
    categoryColors: strMap(r.categoryColors),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run tests/settings/settings.test.ts`
Expected: PASS。

- [ ] **Step 5: 设置页加分类色覆盖编辑器**

在 `src/settings/settings-tab.ts`:

① 在时区那段 `new Setting(containerEl).setName("时区")...` 之后、`// --- iCloud CalDAV` 之前插入:

```ts
    containerEl.createEl("h3", { text: "分类颜色(可选覆盖)" });
    const catWrap = containerEl.createDiv();
    this.renderCategoryColors(catWrap);
```

② 在 `OgendaSettingTab` 类里(`display()` 之后)加私有方法:

```ts
  private renderCategoryColors(wrap: HTMLElement): void {
    wrap.empty();
    const colors = this.plugin.settings.categoryColors;
    for (const name of Object.keys(colors)) {
      const row = new Setting(wrap).setName(name);
      row.addColorPicker((cp) =>
        cp.setValue(colors[name]).onChange(async (v) => {
          this.plugin.settings.categoryColors[name] = v;
          await this.plugin.saveSettings();
        }),
      );
      row.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("移除此覆盖")
          .onClick(async () => {
            delete this.plugin.settings.categoryColors[name];
            await this.plugin.saveSettings();
            this.renderCategoryColors(wrap);
          }),
      );
    }
    let newName = "";
    const addRow = new Setting(wrap).setName("新增覆盖").setDesc("填分类名后点添加(默认蓝,可再改)");
    addRow.addText((t) => t.setPlaceholder("分类名").onChange((v) => (newName = v.trim())));
    addRow.addButton((b) =>
      b.setButtonText("添加").onClick(async () => {
        if (!newName || this.plugin.settings.categoryColors[newName]) return;
        this.plugin.settings.categoryColors[newName] = "#4c8dff";
        await this.plugin.saveSettings();
        this.renderCategoryColors(wrap);
      }),
    );
  }
```

- [ ] **Step 6: 接线 main.ts → 面板构造**

在 `src/main.ts` 的 `registerView` 工厂里,`AgendaPanelView` 构造追加 `categoryColors` 实参:

```ts
        new AgendaPanelView(
          leaf,
          this.store(),
          this.settings.storageFolder,
          this.settings.timezone,
          () => void this.caldavSyncTwoWay(),
          this.settings.categoryColors,
        ),
```

- [ ] **Step 7: 面板构造接收 categoryColors + resolver 用它**

在 `src/agenda-panel/agenda-panel-view.ts`:

① 构造函数参数末尾追加:

```ts
    private triggerSync: () => void,
    private categoryColors: Record<string, string>,
  ) {
```

② `render()` 里把 `const colors = createColorResolver({});` 改为:

```ts
      const colors = createColorResolver(this.categoryColors);
```

- [ ] **Step 8: 构建 + 全量测试**

Run: `npm run build`
Expected: 无报错(`main.ts` 传参与新构造签名一致)。
Run: `node node_modules/vitest/vitest.mjs run`
Expected: 全绿。

- [ ] **Step 9: 真机目测(手动验收)**

设置里加一条"工作 → 某色",保存后回面板,确认"工作"分类的色条/pill 变成覆盖色;移除覆盖后回到自动派色。

- [ ] **Step 10: 提交**

```bash
git add src/settings/settings.ts tests/settings/settings.test.ts src/settings/settings-tab.ts src/main.ts src/agenda-panel/agenda-panel-view.ts
git commit -m "feat(v3ui): settings category-color override UI, wired into the panel color resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review(计划三)

- **Spec 覆盖**:原生日期时间选择器 §4.1(#51)→ Task 1;#52/#54 §4.2 → Task 1;#53 清空字段 §4.2 → Task 2;分类色手动覆盖 §5-7 → Task 3。
- **占位扫描**:无;每个代码步给完整代码。
- **类型一致**:`EventFormModal` 新构造签名(+`defaultAllDay`)与面板 3 处调用一致;`upsertEvents(text, events, opts?)`、`savePanelEvent(event)` 与测试/面板一致;`OgendaSettings.categoryColors` 从 settings→main→panel→`createColorResolver` 一条链类型贯通。
- **合并语义保护**:`upsertEvents` 默认(无 `clearFields`)行为不变,`sync()` 不受影响;清空路径仅经 `savePanelEvent`,`clearFields` 白名单不含任何元数据键。
- **依赖计划一**:`createColorResolver` 来自 `colors.ts`;若单独执行本计划需确保计划一已合入。
