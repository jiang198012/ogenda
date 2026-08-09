import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { monthGridWeeks, startOfDay } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";
import { t } from "../../i18n";

/** How many event chips a day cell shows before a "+N more" affordance. */
const MAX_MINI = 6;

export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
  colors: ColorResolver = createColorResolver(),
): void {
  container.innerHTML = "";
  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();

  const grid = document.createElement("div");
  grid.className = "ogenda-month-grid";

  const weekdayLabels = t("weekday.min").split(",");
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-month-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-month-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-month-othermonth");
      if (onEmptyClick) {
        cell.addEventListener("click", (e) => {
          if (e.target === cell) onEmptyClick(day);
        });
      }

      const num = document.createElement("div");
      num.className = "ogenda-month-daynum";
      num.textContent = String(day.getDate());
      cell.appendChild(num);

      const dayOccs = occurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
      // Cap the chips so one dense day can't stretch the whole week row (and
      // strand the last week's content above the scroll stop); "more" expands.
      const shown = dayOccs.slice(0, MAX_MINI);
      for (const occ of shown) {
        cell.appendChild(miniChip(occ, colors, onEventClick));
      }
      if (dayOccs.length > MAX_MINI) {
        const more = document.createElement("div");
        more.className = "ogenda-month-more";
        more.textContent = t("month.more", { count: dayOccs.length - MAX_MINI });
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          // Lift the cell's overflow clip so the revealed chips are visible.
          cell.classList.add("ogenda-month-cell-expanded");
          for (const occ of dayOccs.slice(MAX_MINI)) cell.appendChild(miniChip(occ, colors, onEventClick));
          more.remove();
        });
        cell.appendChild(more);
      }

      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
}

function miniChip(
  occ: EventOccurrence,
  colors: ColorResolver,
  onEventClick: (event: AgendaEvent) => void,
): HTMLElement {
  const mini = document.createElement("div");
  mini.className = "ogenda-month-mini";
  mini.style.borderLeftColor = colors.category(occ.event.category);
  mini.textContent = occ.event.title;
  mini.addEventListener("click", () => onEventClick(occ.event));
  return mini;
}
