# Ogenda v5-UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 6 user-requested Agenda-panel refinements (list-row dates, sync button, mini-calendar shift, colored week headers, taller month cells, tab-aware week/month title).

**Architecture:** Pure view-layer changes on the existing Agenda panel. Two new pure formatters in `date-format.ts` (unit-tested), DOM tweaks in the view renderers (jsdom-tested), and integration wiring in `agenda-panel-view.ts` (build- + device-verified, since it imports `obsidian` and cannot be unit-tested). No changes to sync, storage, or `stats.ts`.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest (+ jsdom for DOM tests), esbuild.

## Global Constraints

- `manifest.json` `minAppVersion` stays **1.5.0** — do NOT raise it.
- Every commit message ends with the trailer (blank line before it):
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- zh/en i18n key sets must stay identical — any new key is added to BOTH `src/i18n/zh.ts` and `src/i18n/en.ts` (guarded by `tests/i18n/i18n.test.ts` "zh/en key parity").
- Week-header color intent is **weekdays cool / weekend warm**; exact hex may be nudged for light/dark contrast but the intent must hold.
- Do NOT change: sync dispatch/merge semantics, `stats.ts` computation, the list view's "group by status" structure.
- Commands: single test file `npx vitest run <path>`; filter by name add `-t "<name>"`; full suite `npm test`; build `npm run build`.
- Every DOM (jsdom) test file starts with `// @vitest-environment jsdom` as its first line.

---

### Task 1: date-format — `formatDayShort` + `formatWeek` (ISO 8601)

**Files:**
- Modify: `src/agenda-panel/date-format.ts`
- Test: `tests/agenda-panel/date-format.test.ts`

**Interfaces:**
- Consumes: existing `Lang` from `../i18n`; existing module arrays `WEEKDAYS_EN`, `MONTHS_EN`.
- Produces:
  - `formatDayShort(d: Date, lang: Lang): string` — zh `7月20日 周一` / en `Mon, Jul 20` (no year).
  - `formatWeek(d: Date, lang: Lang): string` — zh `2026年第29周` / en `Week 29, 2026`; ISO 8601 week + ISO week-year.

- [ ] **Step 1: Write the failing tests** — append to `tests/agenda-panel/date-format.test.ts`:

```ts
import { formatDate, formatMonth, formatDayShort, formatWeek } from "../../src/agenda-panel/date-format";

describe("formatDayShort (list rows, no year)", () => {
  it("zh: 7月20日 周一", () => {
    expect(formatDayShort(new Date(2026, 6, 20), "zh")).toBe("7月20日 周一");
  });
  it("en: Mon, Jul 20", () => {
    expect(formatDayShort(new Date(2026, 6, 20), "en")).toBe("Mon, Jul 20");
  });
});

describe("formatWeek (ISO 8601 week + week-year)", () => {
  it("zh: 2026-07-19 is 2026年第29周", () => {
    expect(formatWeek(new Date(2026, 6, 19), "zh")).toBe("2026年第29周");
  });
  it("en: 2026-07-19 is Week 29, 2026", () => {
    expect(formatWeek(new Date(2026, 6, 19), "en")).toBe("Week 29, 2026");
  });
  it("zh: 2026-01-01 (Thu) is week 1", () => {
    expect(formatWeek(new Date(2026, 0, 1), "zh")).toBe("2026年第1周");
  });
  it("zh: 2024-12-30 (Mon) rolls into 2025 week 1 (ISO week-year)", () => {
    expect(formatWeek(new Date(2024, 11, 30), "zh")).toBe("2025年第1周");
  });
  it("en: 2024-12-30 rolls into Week 1, 2025", () => {
    expect(formatWeek(new Date(2024, 11, 30), "en")).toBe("Week 1, 2025");
  });
});
```

> Note: the existing file already `import`s `{ formatDate, formatMonth }` on line 2 — replace that import line with the 4-symbol import above (do not add a duplicate import).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-panel/date-format.test.ts`
Expected: FAIL — `formatDayShort`/`formatWeek` are not exported (import/undefined error).

- [ ] **Step 3: Implement** — append to `src/agenda-panel/date-format.ts` (after `formatMonth`):

```ts
const WEEKDAYS_SHORT_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** List-row date, no year. zh "7月20日 周一" / en "Mon, Jul 20". */
export function formatDayShort(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_SHORT_ZH[d.getDay()]}`;
  }
  return `${WEEKDAYS_EN[d.getDay()]}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
}

/** ISO 8601 week number + ISO week-year (year may differ from calendar year at boundaries). */
function isoWeekParts(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (t.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
  const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
  return { year: isoYear, week };
}

/** zh "2026年第29周" / en "Week 29, 2026". */
export function formatWeek(d: Date, lang: Lang): string {
  const { year, week } = isoWeekParts(d);
  if (lang === "zh") return `${year}年第${week}周`;
  return `Week ${week}, ${year}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agenda-panel/date-format.test.ts`
Expected: PASS (all `formatDate`/`formatMonth`/`formatDayShort`/`formatWeek` cases).

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/date-format.ts tests/agenda-panel/date-format.test.ts
git commit -m "feat(v5-ui): date-format — formatDayShort + ISO-week formatWeek"
```

---

### Task 2: List view shows date per row

**Files:**
- Modify: `src/agenda-panel/views/list-view.ts`
- Modify: `styles.css`
- Test: `tests/agenda-panel/views/list-view.test.ts`

**Interfaces:**
- Consumes: `formatDayShort` (Task 1), existing `parseLocalDate` from `../occurrences`, existing `getLanguage` from `../../i18n`.
- Produces: each list row's leading column is `.ogenda-event-when` containing `.ogenda-event-date` (top) + `.ogenda-event-time` (bottom).

- [ ] **Step 1: Write the failing test** — append inside the `describe("renderListView", …)` block in `tests/agenda-panel/views/list-view.test.ts`:

```ts
  it("shows the date above the time on each row", () => {
    const container = document.createElement("div");
    renderListView(container, [mkOcc("a", "2026-07-18T14:00:00", "周会", "confirmed")], () => {});
    const when = container.querySelector(".ogenda-event-when") as HTMLElement;
    expect(when).not.toBeNull();
    expect(when.querySelector(".ogenda-event-date")?.textContent).toBe("7月18日 周六");
    expect(when.querySelector(".ogenda-event-time")?.textContent).toBe("14:00");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts -t "shows the date above the time"`
Expected: FAIL — `.ogenda-event-when` is null.

- [ ] **Step 3: Implement** — in `src/agenda-panel/views/list-view.ts`:

Update imports (top of file) to add `parseLocalDate` and `getLanguage`, and `formatDayShort`:

```ts
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { formatDayShort } from "../date-format";
import { getLanguage, t } from "../../i18n";
```

Replace the time-span block (currently the three lines creating `.ogenda-event-time` and appending it to `row`) with a two-line `when` column:

```ts
      const when = document.createElement("div");
      when.className = "ogenda-event-when";
      const date = document.createElement("span");
      date.className = "ogenda-event-date";
      date.textContent = formatDayShort(parseLocalDate(occ.start), getLanguage());
      when.appendChild(date);
      const time = document.createElement("span");
      time.className = "ogenda-event-time";
      time.textContent = formatTime(occ);
      when.appendChild(time);
      row.appendChild(when);
```

- [ ] **Step 4: Update CSS** — in `styles.css`, under `/* ---------- List view (A style) ---------- */`, change `.ogenda-event-time` to drop `min-width`, and add the two new rules just before it:

```css
.ogenda-event-when {
  display: flex;
  flex-direction: column;
  min-width: 6.5em;
}
.ogenda-event-date {
  font-size: 0.72em;
  color: var(--text-normal);
}
.ogenda-event-time {
  font-size: 0.8em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/agenda-panel/views/list-view.test.ts`
Expected: PASS (new test + all existing list-view tests).

- [ ] **Step 6: Commit**

```bash
git add src/agenda-panel/views/list-view.ts styles.css tests/agenda-panel/views/list-view.test.ts
git commit -m "feat(v5-ui): list view shows date per row (two-line time column)"
```

---

### Task 3: Colored/bold week headers + taller month cells

**Files:**
- Modify: `src/agenda-panel/views/week-view.ts`
- Modify: `styles.css`
- Test: `tests/agenda-panel/views/week-view.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: each `.ogenda-week-col-head` carries an inline `style.color` from a fixed 7-color palette (index 0=Mon … 6=Sun). Its `textContent` is unchanged (`周一 13`).

- [ ] **Step 1: Write the failing test** — append inside `describe("renderWeekView", …)` in `tests/agenda-panel/views/week-view.test.ts`:

```ts
  it("colors each weekday header, with weekend distinct from a weekday", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    const heads = container.querySelectorAll(".ogenda-week-col-head");
    const mon = (heads[0] as HTMLElement).style.color;
    const sat = (heads[5] as HTMLElement).style.color;
    expect(mon).not.toBe("");
    expect(sat).not.toBe("");
    expect(mon).not.toBe(sat);
  });
```

> The existing test asserting `heads[0].textContent === "周一 13"` must still pass — do not change the header text, only add color.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts -t "colors each weekday header"`
Expected: FAIL — `style.color` is empty.

- [ ] **Step 3: Implement** — in `src/agenda-panel/views/week-view.ts`, add the palette constant near the top (after imports) and set the color in the header loop:

```ts
// Mon..Sun: weekdays cool, weekend warm.
const WEEK_COLORS = ["#3B82F6", "#22C55E", "#06B6D4", "#A855F7", "#64748B", "#F59E0B", "#EF4444"];
```

In the `for (let i = 0; i < days.length; i++)` header loop, after setting `head.textContent`, add:

```ts
    head.style.color = WEEK_COLORS[i];
```

- [ ] **Step 4: Update CSS (week header + month cell)** — in `styles.css`:

Change `.ogenda-week-col-head` to bump size, add bold, and drop the muted color (now set inline):

```css
.ogenda-week-col-head {
  text-align: center;
  font-size: 0.95em;
  font-weight: 700;
  padding-bottom: 0.4em;
}
```

Change `.ogenda-month-cell` `min-height` from `5em` to `6.5em` (leave its other properties untouched):

```css
.ogenda-month-cell {
  min-height: 6.5em;
  border-radius: 6px;
  background: var(--background-secondary);
  padding: 0.35em;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/agenda-panel/views/week-view.test.ts`
Expected: PASS (new color test + existing `周一 13` header test).

- [ ] **Step 6: Commit**

```bash
git add src/agenda-panel/views/week-view.ts styles.css tests/agenda-panel/views/week-view.test.ts
git commit -m "feat(v5-ui): week header per-day colors/bold + taller month cells"
```

---

### Task 4: Mini-calendar shifts back one month (previous month first)

**Files:**
- Modify: `src/agenda-panel/mini-calendar.ts`
- Test: `tests/agenda-panel/mini-calendar.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderMiniCalendar` unchanged signature, new behavior — when `monthCount >= 2` the first block is `anchor.month - 1` and the anchor day is highlighted in the block whose month equals the anchor's month; when `monthCount === 1` no shift (current month only). The panel side (Task 5) mirrors the same `shift` for the event-dot range.

- [ ] **Step 1: Write the failing tests** — in `tests/agenda-panel/mini-calendar.test.ts`, add `setLanguage` import and a `beforeEach`, then append three tests, and UPDATE the existing double-dot test:

Add to the top imports and after them:

```ts
import { setLanguage } from "../../src/i18n";
beforeEach(() => setLanguage("zh"));
```
(add `beforeEach` to the `vitest` import: `import { describe, it, expect, vi, beforeEach } from "vitest";`)

Append inside `describe("renderMiniCalendar", …)`:

```ts
  it("shifts back one month for 2+ months: first block is the previous month", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 2 });
    const headers = container.querySelectorAll(".ogenda-mini-cal-header");
    expect(headers[0].textContent).toBe("2026年6月");
    expect(headers[1].textContent).toBe("2026年7月");
  });

  it("keeps the current month (no shift) when only one month fits", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 1 });
    const headers = container.querySelectorAll(".ogenda-mini-cal-header");
    expect(headers[0].textContent).toBe("2026年7月");
  });

  it("highlights the anchor day in the current-month block, not the first block", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 18), () => {}, { monthCount: 2 });
    const months = container.querySelectorAll(".ogenda-mini-cal-month");
    expect(months[0].querySelector(".ogenda-mini-cal-selected")).toBeNull();
    expect(months[1].querySelector(".ogenda-mini-cal-selected")?.textContent).toBe("18");
  });
```

Replace the existing `it("does not double-dot …")` test body with a 3-month version so it still covers real-vs-padding dedup after the shift (with shift, monthCount:3 shows Jun/Jul/Aug — July 29 is real in the July block and padding in the August block):

```ts
  it("does not double-dot a day that is real in one month block but padding in an adjacent one", () => {
    const container = document.createElement("div");
    // With the 1-month back-shift, monthCount:3 anchored in July shows Jun/Jul/Aug.
    // 2026-07-29 is a real cell in the July block and a padding cell in the August block
    // (the Aug grid starts Mon 2026-07-27). It must be dotted exactly once — in its own month.
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, {
      monthCount: 3,
      eventDays: new Set(["2026-07-29"]),
    });
    expect(container.querySelectorAll(".ogenda-mini-cal-dot").length).toBe(1);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/agenda-panel/mini-calendar.test.ts`
Expected: FAIL — the shift/selected tests fail (first block is still July; selected sits in block 0).

- [ ] **Step 3: Implement** — in `src/agenda-panel/mini-calendar.ts`, replace the loop body of `renderMiniCalendar`:

```ts
  const count = Math.max(1, opts.monthCount ?? 1);
  const shift = count >= 2 ? 1 : 0;
  const eventDays = opts.eventDays ?? new Set<string>();
  for (let i = 0; i < count; i++) {
    const monthAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - shift + i, 1);
    const isCurrent =
      monthAnchor.getFullYear() === anchor.getFullYear() && monthAnchor.getMonth() === anchor.getMonth();
    renderOneMonth(wrap, monthAnchor, isCurrent ? anchor : null, eventDays, onDayClick);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/agenda-panel/mini-calendar.test.ts`
Expected: PASS (new tests + all existing default-count tests unaffected — `shift` is 0 when count is 1).

- [ ] **Step 5: Commit**

```bash
git add src/agenda-panel/mini-calendar.ts tests/agenda-panel/mini-calendar.test.ts
git commit -m "feat(v5-ui): mini-calendar shifts back one month (prev month first)"
```

---

### Task 5: Panel integration — sync button, tab-aware title, mini-cal range shift

**Files:**
- Modify: `src/i18n/zh.ts`, `src/i18n/en.ts`
- Modify: `src/agenda-panel/agenda-panel-view.ts`
- Modify: `styles.css`
- Test: `tests/i18n/i18n.test.ts` (existing parity test guards the new key; no new assertion needed)

**Interfaces:**
- Consumes: `formatWeek`, `formatMonth` (Task 1 / existing) from `./date-format`; `renderMiniCalendar` shifted behavior (Task 4); existing injected `triggerSync`, `getSyncProvider`; `setIcon` from `obsidian`; new i18n key `panel.sync`.
- Produces: no exported interface (integration only). This file imports `obsidian` and therefore has **no unit test** (consistent with the rest of `agenda-panel-view.ts`); it is verified by `npm run build` + device check. Its two pieces of real logic (`formatWeek`, mini shift) are already unit-tested in Tasks 1 and 4.

- [ ] **Step 1: Add the `panel.sync` i18n key to BOTH tables**

In `src/i18n/zh.ts`, immediately after the `"panel.newEvent"` line, add:
```ts
  "panel.sync": "同步",
```
In `src/i18n/en.ts`, immediately after the `"panel.newEvent"` line, add:
```ts
  "panel.sync": "Sync",
```

- [ ] **Step 2: Run the parity test to verify both tables still match**

Run: `npx vitest run tests/i18n/i18n.test.ts`
Expected: PASS ("zh/en key parity" green — both tables gained `panel.sync`).

- [ ] **Step 3: Add `setIcon` to the obsidian import** — in `src/agenda-panel/agenda-panel-view.ts` line 2:

```ts
import { ItemView, WorkspaceLeaf, Modal, Notice, setIcon } from "obsidian";
```

- [ ] **Step 4: Add `formatWeek`/`formatMonth` to the date-format import** — replace the existing `import { formatDate } from "./date-format";` line:

```ts
import { formatDate, formatWeek, formatMonth } from "./date-format";
```

- [ ] **Step 5: Make the nav title tab-aware** — replace the `isToday`/`todayBtn` block (the `const isToday …` line through the `const todayBtn = nav.createSpan({…})` call) with:

```ts
    const lang = getLanguage();
    let navLabel: string;
    if (this.tab === "week") navLabel = formatWeek(this.anchor, lang);
    else if (this.tab === "month") navLabel = formatMonth(this.anchor, lang);
    else {
      const isToday = startOfDay(this.anchor).getTime() === startOfDay(this.safeToday()).getTime();
      navLabel = isToday ? `${t("panel.today")} · ${formatDate(this.anchor, lang)}` : formatDate(this.anchor, lang);
    }
    const todayBtn = nav.createSpan({ cls: "ogenda-navbtn ogenda-navtoday", text: navLabel });
```

(The `todayBtn.addEventListener("click", …)` that resets to today stays unchanged, right after this.)

- [ ] **Step 6: Add the sync button** — in the `try` block, immediately after the `newBtn.addEventListener("click", …)` call (i.e. after the new-event button is fully wired), add:

```ts
      const syncBtn = head.createDiv({ cls: "ogenda-panel-syncbtn" });
      setIcon(syncBtn, "refresh-cw");
      syncBtn.createSpan({ text: t("panel.sync") });
      if (this.getSyncProvider() === "none") {
        syncBtn.addClass("ogenda-disabled");
      } else {
        syncBtn.addEventListener("click", () => this.triggerSync());
      }
```

- [ ] **Step 7: Shift the mini-calendar event-dot range** — replace the `miniStart`/`miniEnd` two lines (in the `this.tab === "day"` branch) with:

```ts
          const shift = monthCount >= 2 ? 1 : 0;
          const miniStart = new Date(this.anchor.getFullYear(), this.anchor.getMonth() - shift, 1);
          const miniEnd = new Date(this.anchor.getFullYear(), this.anchor.getMonth() - shift + monthCount, 1);
```

(`monthCount` is already declared just above these lines; keep it.)

- [ ] **Step 8: Add CSS for the sync button** — in `styles.css`, right after the `.ogenda-panel-newbtn { … }` rule, add:

```css
.ogenda-panel-syncbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  cursor: pointer;
  padding: 0.35em 0.7em;
  border-radius: 7px;
  background: var(--background-modifier-hover);
  color: var(--text-normal);
  font-size: 0.8em;
  font-weight: 600;
}
.ogenda-panel-syncbtn:hover {
  background: var(--background-modifier-active-hover);
}
.ogenda-panel-syncbtn .svg-icon {
  width: 1em;
  height: 1em;
}
.ogenda-disabled {
  opacity: 0.45;
  pointer-events: none;
}
```

- [ ] **Step 9: Verify build is clean**

Run: `npm run build`
Expected: `tsc -noEmit` reports no errors and esbuild produces `main.js` (no type errors from the new imports/usages).

- [ ] **Step 10: Full test suite green**

Run: `npm test`
Expected: PASS — all prior tests plus Tasks 1–4 additions; parity test green.

- [ ] **Step 11: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts src/agenda-panel/agenda-panel-view.ts styles.css
git commit -m "feat(v5-ui): panel — sync button, tab-aware title, mini-cal range shift + panel.sync i18n"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-19-ogenda-v5-panel-ui-polish-design.md`):
- ① list date → Task 2 ✓
- ② sync button → Task 5 (steps 1–2 i18n, 3/6/8 button) ✓
- ③ mini-calendar shift → Task 4 (renderer) + Task 5 step 7 (dot range) ✓
- ④ week header colors/bold → Task 3 ✓
- ⑤ month cell +30% → Task 3 step 4 ✓
- ⑥ week/month title + ISO week → Task 1 (`formatWeek`) + Task 5 step 5 ✓

**2. Placeholder scan:** no TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**3. Type consistency:** `formatDayShort(d,lang)`/`formatWeek(d,lang)` signatures identical in Task 1 (def) and Tasks 2/5 (use); `shift = monthCount >= 2 ? 1 : 0` identical in Task 4 and Task 5 step 7; class names `.ogenda-event-when`/`.ogenda-event-date` consistent between list-view impl (Task 2 step 3) and CSS (Task 2 step 4); `panel.sync` key consistent between Task 5 steps 1 and 6. ✓

## Device-Only Verification (after all tasks)

Automated tests cannot see visuals. On the real vault, confirm: list rows show date+time; sync button appears (disabled when provider=none) and triggers a sync; mini-calendar's first block is last month with today highlighted in the second; week headers are colored/bold/larger; month cells are taller; week tab title reads `2026年第29周`, month tab reads `2026年7月`; language toggle re-renders all of the above.
