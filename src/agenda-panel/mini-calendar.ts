import { monthGridWeeks, startOfDay, toDateKey } from "./date-grid";
import { formatMonth } from "./date-format";
import { getLanguage, t } from "../i18n";
import { EventOccurrence, parseLocalDate } from "./occurrences";

/** How many months fit in the sidebar. Unknown height (≤0) → show a few; else fill by per-month height. */
export function monthsToFill(availableHeightPx: number, perMonthPx = 240): number {
  if (!(availableHeightPx > 0)) return 3;
  return Math.max(1, Math.floor(availableHeightPx / perMonthPx));
}

/** The set of date keys (YYYY-MM-DD) that carry at least one event occurrence. */
export function daysWithEvents(occurrences: EventOccurrence[]): Set<string> {
  const set = new Set<string>();
  for (const occ of occurrences) {
    set.add(toDateKey(startOfDay(parseLocalDate(occ.start))));
  }
  return set;
}

interface MiniCalOpts {
  monthCount?: number;
  eventDays?: Set<string>;
  today?: Date;
}

function renderOneMonth(
  wrap: HTMLElement,
  monthAnchor: Date,
  selected: Date | null,
  eventDays: Set<string>,
  onDayClick: (day: Date) => void,
  todayKey: string | null,
): void {
  const monthEl = document.createElement("div");
  monthEl.className = "ogenda-mini-cal-month";

  const header = document.createElement("div");
  header.className = "ogenda-mini-cal-header";
  header.textContent = formatMonth(monthAnchor, getLanguage());
  monthEl.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "ogenda-mini-cal-grid";
  const weekdayLabels = t("weekday.min").split(",");
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-mini-cal-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  const weeks = monthGridWeeks(monthAnchor);
  const month = monthAnchor.getMonth();
  const selKey = selected ? toDateKey(startOfDay(selected)) : null;

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-mini-cal-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-mini-cal-othermonth");
      const dayKey = toDateKey(day);
      if (selKey && dayKey === selKey) cell.classList.add("ogenda-mini-cal-selected");
      // Frame today, but only in its OWN month block — same rule as the dot below,
      // so a padding duplicate in an adjacent stacked block is not double-framed.
      if (todayKey && dayKey === todayKey && day.getMonth() === month) {
        cell.classList.add("ogenda-mini-cal-today");
      }
      cell.textContent = String(day.getDate());
      // Only dot a day in its OWN month block — a padding (othermonth) cell that repeats a day
      // shown as a real cell in an adjacent stacked block must not double-dot it.
      if (eventDays.has(dayKey) && day.getMonth() === month) {
        const dot = document.createElement("span");
        dot.className = "ogenda-mini-cal-dot";
        cell.appendChild(dot);
      }
      cell.addEventListener("click", () => onDayClick(day));
      grid.appendChild(cell);
    }
  }
  monthEl.appendChild(grid);
  wrap.appendChild(monthEl);
}

export function renderMiniCalendar(
  container: HTMLElement,
  anchor: Date,
  onDayClick: (day: Date) => void,
  opts: MiniCalOpts = {},
): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ogenda-mini-cal";

  const count = Math.max(1, opts.monthCount ?? 1);
  const shift = count >= 2 ? 1 : 0;
  const eventDays = opts.eventDays ?? new Set<string>();
  const todayKey = opts.today ? toDateKey(startOfDay(opts.today)) : null;
  for (let i = 0; i < count; i++) {
    const monthAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - shift + i, 1);
    const isCurrent =
      monthAnchor.getFullYear() === anchor.getFullYear() && monthAnchor.getMonth() === anchor.getMonth();
    renderOneMonth(wrap, monthAnchor, isCurrent ? anchor : null, eventDays, onDayClick, todayKey);
  }
  container.appendChild(wrap);
}
