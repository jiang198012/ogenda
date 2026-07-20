# Ogenda Event-Form Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the new/edit event form (`EventFormModal`) — data constraints (timed-end validation, zh status/RSVP dropdowns) and filling convenience (end auto +1h & follow-start, advanced-field collapse, category merge, focus/Enter, required marks).

**Architecture:** Pure logic (validation, end-shift, RSVP options) goes into `event-form-fields.ts` and is unit-tested. The modal UI (`event-form-modal.ts`) imports `obsidian`, cannot be unit-tested, and is verified by `npm run build` + full suite + device check. i18n keys are added/changed with the parity test as guard.

**Tech Stack:** TypeScript, Obsidian plugin API (`Modal`, `Setting`, `setIcon`, native `<datalist>`), Vitest.

## Global Constraints

- `manifest.json` `minAppVersion` stays 1.5.0 — do NOT touch manifest.
- Every commit message ends with a trailer (blank line before it): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- zh/en i18n key sets stay identical — any add/remove is done in BOTH `src/i18n/zh.ts` and `src/i18n/en.ts` (guarded by `tests/i18n/i18n.test.ts` "zh/en key parity").
- Stored values are unchanged: status stores `confirmed`/`tentative`/`cancelled`; RSVP stores iCal PARTSTAT `NEEDS-ACTION`/`ACCEPTED`/`DECLINED`/`TENTATIVE`. Only the displayed labels are Chinese.
- Status dropdown reuses existing `status.confirmed`/`status.tentative`/`status.cancelled` (已确认/待定/已取消) — do NOT invent new status labels.
- Do NOT change: `AgendaEvent` model, sync/merge semantics, storage format. No email validation (explicit non-goal).
- Commands: single test `npx vitest run <path>`; full suite `npm test`; build `npm run build`.
- DOM test files start with `// @vitest-environment jsdom` as line 1.

---

### Task 1: Pure form logic — timed-end validation, end-shift, defaults, RSVP options

**Files:**
- Modify: `src/agenda-panel/event-form-fields.ts`
- Test: `tests/agenda-panel/event-form-fields.test.ts`

**Interfaces:**
- Consumes: existing `normSep` (already in file), existing `t` from `../i18n`.
- Produces:
  - `validateEventForm` — now also flags timed `end ≤ start`.
  - `shiftEndWithStart(oldStart: string, oldEnd: string, newStart: string): string` — moves end to preserve duration; returns `oldEnd` unchanged if end empty or any parse fails.
  - `defaultEndFor(start: string, allDay: boolean): string` — new-event default end (timed → start+1h; all-day/empty → "").
  - `RSVP_OPTIONS: { value: string; labelKey: string }[]` — the 4 PARTSTAT options in display order.

- [ ] **Step 1: Write the failing tests** — append to `tests/agenda-panel/event-form-fields.test.ts`:

```ts
import {
  validateEventForm,
  shiftEndWithStart,
  defaultEndFor,
  RSVP_OPTIONS,
} from "../../src/agenda-panel/event-form-fields";

describe("validateEventForm — timed end", () => {
  it("flags a timed event whose end is not after start", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "2026-07-19T13:00:00", allDay: false });
    expect(r.valid).toBe(false);
  });
  it("accepts a timed event whose end is after start", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "2026-07-19T15:00:00", allDay: false });
    expect(r.valid).toBe(true);
  });
  it("timed event with empty end is valid", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "", allDay: false });
    expect(r.valid).toBe(true);
  });
});

describe("shiftEndWithStart", () => {
  it("timed: preserves duration when start moves", () => {
    expect(shiftEndWithStart("2026-07-19T09:00:00", "2026-07-19T10:00:00", "2026-07-19T14:00:00")).toBe("2026-07-19T15:00:00");
  });
  it("timed: preserves a cross-midnight duration", () => {
    expect(shiftEndWithStart("2026-07-19T23:00:00", "2026-07-20T01:00:00", "2026-07-25T23:00:00")).toBe("2026-07-26T01:00:00");
  });
  it("all-day (date-only): preserves day span and stays date-only", () => {
    expect(shiftEndWithStart("2026-07-19", "2026-07-21", "2026-07-25")).toBe("2026-07-27");
  });
  it("empty end → unchanged empty", () => {
    expect(shiftEndWithStart("2026-07-19T09:00:00", "", "2026-07-20T09:00:00")).toBe("");
  });
});

describe("defaultEndFor", () => {
  it("timed new event → start + 1h", () => {
    expect(defaultEndFor("2026-07-19T09:00:00", false)).toBe("2026-07-19T10:00:00");
  });
  it("all-day → empty", () => {
    expect(defaultEndFor("2026-07-19", true)).toBe("");
  });
  it("empty start → empty", () => {
    expect(defaultEndFor("", false)).toBe("");
  });
});

describe("RSVP_OPTIONS", () => {
  it("lists the 4 PARTSTAT values in order", () => {
    expect(RSVP_OPTIONS.map((o) => o.value)).toEqual(["NEEDS-ACTION", "ACCEPTED", "DECLINED", "TENTATIVE"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts`
Expected: FAIL — `shiftEndWithStart`/`defaultEndFor`/`RSVP_OPTIONS` not exported; timed-end test fails (no timed check yet).

- [ ] **Step 3: Implement** — in `src/agenda-panel/event-form-fields.ts`:

Add local date helpers + the new exports (near the other helpers), and extend `validateEventForm`:

```ts
/** Parse an ISO date or datetime string as LOCAL time (no timezone shift). */
function parseLocal(s: string): Date | null {
  const m = normSep(s.trim());
  if (!m) return null;
  const [datePart, timePart] = m.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const [hh = 0, mi = 0, ss = 0] = timePart ? timePart.split(":").map(Number) : [];
  return new Date(y, mo - 1, d, hh, mi, ss);
}

function fmtLocal(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return dateOnly ? date : `${date}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Move end to preserve (end − start) when start changes. Empty/invalid end → returned unchanged. */
export function shiftEndWithStart(oldStart: string, oldEnd: string, newStart: string): string {
  if (!oldEnd.trim()) return oldEnd;
  const os = parseLocal(oldStart), oe = parseLocal(oldEnd), ns = parseLocal(newStart);
  if (!os || !oe || !ns) return oldEnd;
  const ne = new Date(ns.getTime() + (oe.getTime() - os.getTime()));
  return fmtLocal(ne, !normSep(oldEnd.trim()).includes("T"));
}

/** Default end for a NEW event: timed → start + 1h; all-day or empty → "". */
export function defaultEndFor(start: string, allDay: boolean): string {
  if (allDay || !start.trim()) return "";
  const s = parseLocal(start);
  if (!s) return "";
  return fmtLocal(new Date(s.getTime() + 3600_000), false);
}

export const RSVP_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "NEEDS-ACTION", labelKey: "rsvp.needsAction" },
  { value: "ACCEPTED", labelKey: "rsvp.accepted" },
  { value: "DECLINED", labelKey: "rsvp.declined" },
  { value: "TENTATIVE", labelKey: "rsvp.tentative" },
];
```

In `validateEventForm`, after the existing all-day block, add the timed block:

```ts
  if (!fields.allDay && fields.end && fields.end.trim()) {
    const s = normSep(fields.start.trim());
    const e = normSep(fields.end.trim());
    if (e <= s) errors.push(t("validate.timedEnd"));
  }
```

(The `validateEventForm` param type already allows `end?`/`allDay?` — no signature change.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts`
Expected: PASS (new cases + existing cases). `validate.timedEnd` renders as the key string until Task 2 adds it — that does not fail these tests (they assert `valid`, not message text).

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/event-form-fields.ts tests/agenda-panel/event-form-fields.test.ts
git commit -m "feat(event-form): timed end>start validation + shiftEndWithStart/defaultEndFor + RSVP_OPTIONS"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `src/i18n/zh.ts`, `src/i18n/en.ts`
- Test: `tests/i18n/i18n.test.ts` (existing parity test — no new assertion)

**Interfaces:**
- Produces: keys `validate.timedEnd`, `form.moreOptions`, `rsvp.name`, `rsvp.needsAction`, `rsvp.accepted`, `rsvp.declined`, `rsvp.tentative`, `rsvp.currentValue` (with `{value}`); changed `form.category.desc`.

- [ ] **Step 1: Add/modify keys in BOTH tables**

In `src/i18n/zh.ts` add (place `validate.timedEnd` next to the existing `validate.*`, the `rsvp.*` next to `status.*`, `form.moreOptions` in the `form.*` block):
```ts
  "validate.timedEnd": "结束时间需晚于开始时间",
  "form.moreOptions": "更多选项",
  "rsvp.name": "回复状态",
  "rsvp.needsAction": "待答复",
  "rsvp.accepted": "已接受",
  "rsvp.declined": "已拒绝",
  "rsvp.tentative": "暂定",
  "rsvp.currentValue": "当前值：{value}",
```
Change `form.category.desc` to `"选择已有或输入新分类"`.

In `src/i18n/en.ts` add:
```ts
  "validate.timedEnd": "End time must be after start time",
  "form.moreOptions": "More options",
  "rsvp.name": "RSVP",
  "rsvp.needsAction": "Needs action",
  "rsvp.accepted": "Accepted",
  "rsvp.declined": "Declined",
  "rsvp.tentative": "Tentative",
  "rsvp.currentValue": "Current: {value}",
```
Change `form.category.desc` to `"Pick an existing one or type a new one"`.

> Do NOT remove `form.newCategory.*` yet — the modal still references it until Task 3.

- [ ] **Step 2: Run the parity test**

Run: `npx vitest run tests/i18n/i18n.test.ts`
Expected: PASS — both tables gained the same 8 keys.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(event-form): i18n — validate.timedEnd, rsvp.*, form.moreOptions; reword form.category.desc"
```

---

### Task 3: Form structure + modal rebuild (fields merge, zh dropdowns, collapse, live-validate, focus/Enter, end-follow)

**Files:**
- Modify: `src/agenda-panel/event-form-fields.ts` (RawFormFields + buildEventFromFields)
- Modify: `src/agenda-panel/event-form-modal.ts` (full onOpen rebuild)
- Modify: `src/i18n/zh.ts`, `src/i18n/en.ts` (remove `form.newCategory.*`)
- Modify: `styles.css`
- Test: `tests/agenda-panel/event-form-fields.test.ts` (update category cases)

**Interfaces:**
- Consumes: `validateEventForm`, `shiftEndWithStart`, `defaultEndFor`, `RSVP_OPTIONS` (Task 1); i18n keys (Task 2); existing `isoToDateValue`/`isoToDatetimeLocalValue`/`dateValueToIso`/`datetimeLocalValueToIso`/`initialStart`.
- Produces: `RawFormFields` with single `category: string` (no `categoryDropdown`/`categoryText`).

- [ ] **Step 1: Update RawFormFields + buildEventFromFields + their tests (RED→GREEN)**

In `src/agenda-panel/event-form-fields.ts`, change `RawFormFields`: remove `categoryDropdown` and `categoryText`, add `category: string;` (place where the two removed lines were).

Change `buildEventFromFields` — replace the `const category = ...` line and the `category,` usage with a single field read:
```ts
  const category = fields.category.trim() || undefined;
```
(the returned `category,` line stays; `rsvp: fields.rsvp.trim() || undefined,` is already correct.)

In `tests/agenda-panel/event-form-fields.test.ts`, any existing test that builds a `RawFormFields` with `categoryDropdown`/`categoryText` must switch to `category`. Add this focused test:
```ts
import { buildEventFromFields, RawFormFields } from "../../src/agenda-panel/event-form-fields";

const baseFields = (over: Partial<RawFormFields> = {}): RawFormFields => ({
  title: "会", start: "2026-07-19T09:00:00", end: "", allDay: false,
  location: "", organizer: "", attendees: "", status: "", rsvp: "",
  category: "", tags: "", ...over,
});

describe("buildEventFromFields — merged category + rsvp", () => {
  it("uses the single category field", () => {
    const ev = buildEventFromFields(baseFields({ category: "工作" }), null, () => "uid1");
    expect(ev.category).toBe("工作");
  });
  it("empty category → undefined", () => {
    const ev = buildEventFromFields(baseFields({ category: "  " }), null, () => "uid1");
    expect(ev.category).toBeUndefined();
  });
  it("stores the raw RSVP enum value", () => {
    const ev = buildEventFromFields(baseFields({ rsvp: "ACCEPTED" }), null, () => "uid1");
    expect(ev.rsvp).toBe("ACCEPTED");
  });
});
```

Run: `npx vitest run tests/agenda-panel/event-form-fields.test.ts` → PASS (update any old category-field references until green).

- [ ] **Step 2: Remove `form.newCategory.*` from both i18n tables**

Delete `"form.newCategory.name"` and `"form.newCategory.desc"` lines from `src/i18n/zh.ts` and `src/i18n/en.ts`.
Run: `npx vitest run tests/i18n/i18n.test.ts` → PASS (removed the same 2 keys from both).

- [ ] **Step 3: Rebuild the modal** — replace `src/agenda-panel/event-form-modal.ts` with this implementation (imports updated, constructor category/end defaults, full `onOpen`, `updateValidity`, `titleInput`/`saveBtn` fields):

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
  shiftEndWithStart,
  defaultEndFor,
  RSVP_OPTIONS,
} from "./event-form-fields";
import { t } from "../i18n";

export class EventFormModal extends Modal {
  private fields: RawFormFields;
  private errorEl: HTMLElement | null = null;
  private startInput!: HTMLInputElement;
  private endInput!: HTMLInputElement;
  private titleInput!: HTMLInputElement;
  private saveBtn!: HTMLButtonElement;

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
    const allDay = existing?.allDay ?? defaultAllDay;
    const start = existing?.start ?? initialStart(prefillStart ?? "", allDay);
    this.fields = {
      title: existing?.title ?? "",
      start,
      end: existing?.end ?? defaultEndFor(start, allDay),
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      category: existing?.category ?? "",
      tags: existing?.tags?.join(", ") ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(t(this.existing ? "form.titleEdit" : "form.titleNew"));
    const { contentEl } = this;

    new Setting(contentEl).setName(t("form.title.name") + " *").addText((tx) => {
      this.titleInput = tx.inputEl;
      tx.setValue(this.fields.title).onChange((v) => {
        this.fields.title = v;
        this.updateValidity();
      });
    });

    new Setting(contentEl).setName(t("form.allDay.name")).addToggle((tg) =>
      tg.setValue(this.fields.allDay).onChange((v) => {
        this.fields.start = this.readDateInput(this.startInput);
        this.fields.end = this.readDateInput(this.endInput);
        this.fields.allDay = v;
        this.applyDateInputs();
        this.updateValidity();
      }),
    );

    const startRow = new Setting(contentEl).setName(t("form.start.name") + " *");
    this.startInput = startRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    const endRow = new Setting(contentEl).setName(t("form.end.name")).setDesc(t("form.end.desc"));
    this.endInput = endRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    this.applyDateInputs();
    this.startInput.addEventListener("change", () => {
      const newStart = this.readDateInput(this.startInput);
      this.fields.end = shiftEndWithStart(this.fields.start, this.readDateInput(this.endInput), newStart);
      this.fields.start = newStart;
      this.applyDateInputs();
      this.updateValidity();
    });
    this.endInput.addEventListener("change", () => {
      this.fields.end = this.readDateInput(this.endInput);
      this.updateValidity();
    });

    new Setting(contentEl).setName(t("form.location.name")).addText((tx) =>
      tx.setValue(this.fields.location).onChange((v) => (this.fields.location = v)),
    );

    const catRow = new Setting(contentEl).setName(t("form.category.name")).setDesc(t("form.category.desc"));
    const catInput = catRow.controlEl.createEl("input", { type: "text" });
    catInput.value = this.fields.category;
    const dl = catRow.controlEl.createEl("datalist");
    dl.id = "ogenda-cat-list";
    for (const c of this.existingCategories) dl.createEl("option", { value: c });
    catInput.setAttr("list", "ogenda-cat-list");
    catInput.addEventListener("input", () => (this.fields.category = catInput.value));

    new Setting(contentEl)
      .setName(t("form.tags.name"))
      .setDesc(t("form.commaSeparated"))
      .addText((tx) => tx.setValue(this.fields.tags).onChange((v) => (this.fields.tags = v)));

    const moreToggle = contentEl.createDiv({ cls: "ogenda-form-more-toggle" });
    const advanced = contentEl.createDiv({ cls: "ogenda-form-advanced" });

    new Setting(advanced).setName(t("form.organizer.name")).addText((tx) =>
      tx.setValue(this.fields.organizer).onChange((v) => (this.fields.organizer = v)),
    );
    new Setting(advanced)
      .setName(t("form.attendees.name"))
      .setDesc(t("form.commaSeparated"))
      .addText((tx) => tx.setValue(this.fields.attendees).onChange((v) => (this.fields.attendees = v)));
    new Setting(advanced).setName(t("form.status.name")).addDropdown((d) =>
      d
        .addOption("", t("form.status.unset"))
        .addOption("confirmed", t("status.confirmed"))
        .addOption("tentative", t("status.tentative"))
        .addOption("cancelled", t("status.cancelled"))
        .setValue(this.fields.status)
        .onChange((v) => (this.fields.status = v)),
    );
    new Setting(advanced).setName(t("rsvp.name")).addDropdown((d) => {
      d.addOption("", t("form.status.unset"));
      for (const opt of RSVP_OPTIONS) d.addOption(opt.value, t(opt.labelKey));
      const cur = this.fields.rsvp.trim();
      if (cur && !RSVP_OPTIONS.some((o) => o.value === cur)) d.addOption(cur, t("rsvp.currentValue", { value: cur }));
      d.setValue(this.fields.rsvp).onChange((v) => (this.fields.rsvp = v));
    });

    const advHasValue = !!(this.fields.organizer || this.fields.attendees || this.fields.status || this.fields.rsvp);
    const setAdvanced = (open: boolean) => {
      advanced.style.display = open ? "" : "none";
      moreToggle.setText((open ? "▾ " : "▸ ") + t("form.moreOptions"));
    };
    setAdvanced(advHasValue);
    moreToggle.addEventListener("click", () => setAdvanced(advanced.style.display === "none"));

    this.errorEl = contentEl.createDiv({ cls: "ogenda-form-error" });

    const buttonRow = contentEl.createDiv({ cls: "ogenda-form-buttons" });
    if (this.existing && this.onViewInNote) {
      const viewBtn = buttonRow.createEl("button", { text: t("form.viewInNote") });
      viewBtn.addEventListener("click", () => {
        this.close();
        this.onViewInNote!();
      });
    }
    if (this.existing && this.onDelete) {
      const delBtn = buttonRow.createEl("button", { text: t("form.delete") });
      delBtn.addEventListener("click", () => {
        this.close();
        this.onDelete!();
      });
    }
    this.saveBtn = buttonRow.createEl("button", { text: t("form.save"), cls: "mod-cta" });
    this.saveBtn.addEventListener("click", () => this.handleSave());

    this.updateValidity();
    this.titleInput.focus();
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !this.saveBtn.disabled) {
        e.preventDefault();
        this.handleSave();
      }
    });
  }

  private updateValidity(): void {
    const result = validateEventForm({
      title: this.fields.title,
      start: this.readDateInput(this.startInput),
      end: this.readDateInput(this.endInput),
      allDay: this.fields.allDay,
    });
    if (this.errorEl) this.errorEl.setText(result.valid ? "" : result.errors.join("; "));
    if (this.saveBtn) this.saveBtn.disabled = !result.valid;
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

- [ ] **Step 4: Add CSS** — in `styles.css`, after the `.ogenda-form-datetime` rule, add:

```css
.ogenda-form-more-toggle {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.85em;
  font-weight: 600;
  padding: 0.5em 0 0.3em;
  user-select: none;
}
.ogenda-form-more-toggle:hover {
  color: var(--text-normal);
}
.ogenda-form-advanced {
  border-top: 1px solid var(--background-modifier-border);
  margin-top: 0.2em;
}
```

- [ ] **Step 5: Build clean**

Run: `npm run build`
Expected: `tsc -noEmit` no errors (RawFormFields change propagated: modal no longer references `categoryDropdown`/`categoryText`), esbuild produces `main.js`.

- [ ] **Step 6: Full suite green**

Run: `npm test`
Expected: PASS — all prior tests + Task 1/3 field-test updates; i18n parity green after the newCategory removal.

- [ ] **Step 7: Commit**

```bash
git add src/agenda-panel/event-form-fields.ts src/agenda-panel/event-form-modal.ts src/i18n/zh.ts src/i18n/en.ts styles.css tests/agenda-panel/event-form-fields.test.ts
git commit -m "feat(event-form): merge category, zh status/RSVP dropdowns, collapse advanced, live-validate, focus+Enter, end-follow, required marks"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-19-ogenda-event-form-polish-design.md`):
- A1 timed end validation → Task 1 ✓
- A2 status zh dropdown → Task 3 step 3 (reuses `status.*`) ✓
- A3 RSVP dropdown + history value → Task 1 (options) + Task 2 (i18n) + Task 3 step 3 ✓
- A4 live validation → Task 3 (`updateValidity`) ✓
- A5 no email validation → not implemented (correct) ✓
- B1 end +1h & follow → Task 1 (`defaultEndFor`/`shiftEndWithStart`) + Task 3 (constructor + start `change`) ✓
- B2 collapse (+ edit default-expand) → Task 3 (`advanced`/`moreToggle`/`advHasValue`) ✓
- B3 category merge (datalist) → Task 1? no — Task 3 (RawFormFields + datalist) ✓
- B4 focus + Enter → Task 3 ✓
- B5 field reorder → Task 3 onOpen order ✓
- B6 required marks → Task 3 (`+ " *"`) ✓
- i18n add/change/remove → Task 2 (add/change) + Task 3 step 2 (remove newCategory) ✓

**2. Placeholder scan:** every code step has full code; no TBD/TODO. ✓

**3. Type consistency:** `RawFormFields.category: string` defined in Task 3 step 1, used in modal (Task 3 step 3) and `buildEventFromFields`; `shiftEndWithStart(oldStart, oldEnd, newStart)` / `defaultEndFor(start, allDay)` / `RSVP_OPTIONS[].value/labelKey` identical across Task 1 (def) and Task 3 (use). ✓

## Device-Only Verification (after all tasks)

On the real vault: new event shows end = start+1h; changing start moves end preserving duration; timed end<start blocks save (button greys, red msg); category is one input with existing-category suggestions; status/RSVP dropdowns show Chinese; advanced fields collapsed by default (expanded when editing an event that has them); title auto-focused; Enter saves; required `*` on title/start; language toggle keeps all labels correct.
