import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { monthGridWeeks, startOfDay, toDateKey } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";
import { t } from "../../i18n";

/** How many event chips a day cell shows before a "+N more" affordance. */
const MAX_MINI = 6;

const DND_TYPE = "text/ogenda-uid";

export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (occ: EventOccurrence) => void,
  onEmptyClick?: (day: Date) => void,
  colors: ColorResolver = createColorResolver(),
  onMoveToDay?: (occ: EventOccurrence, toDay: Date) => void,
): void {
  container.innerHTML = "";
  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();
  const byUid = new Map<string, EventOccurrence>();
  for (const occ of occurrences) byUid.set(occ.event.uid, occ);

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
      cell.dataset.day = toDateKey(day);
      if (onEmptyClick) {
        cell.addEventListener("click", (e) => {
          if (e.target === cell) onEmptyClick(day);
        });
      }
      if (onMoveToDay) {
        cell.addEventListener("dragover", (e) => {
          if (e.dataTransfer?.types.includes(DND_TYPE)) {
            e.preventDefault();
            cell.classList.add("ogenda-month-drop");
          }
        });
        cell.addEventListener("dragleave", () => cell.classList.remove("ogenda-month-drop"));
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("ogenda-month-drop");
          const uid = e.dataTransfer?.getData(DND_TYPE);
          const occ = uid ? byUid.get(uid) : undefined;
          if (occ) onMoveToDay(occ, day);
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
        cell.appendChild(miniChip(occ, colors, onEventClick, onMoveToDay));
      }
      if (dayOccs.length > MAX_MINI) {
        const more = document.createElement("div");
        more.className = "ogenda-month-more";
        more.textContent = t("month.more", { count: dayOccs.length - MAX_MINI });
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          // Lift the cell's overflow clip so the revealed chips are visible.
          cell.classList.add("ogenda-month-cell-expanded");
          for (const occ of dayOccs.slice(MAX_MINI)) cell.appendChild(miniChip(occ, colors, onEventClick, onMoveToDay));
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
  onEventClick: (occ: EventOccurrence) => void,
  onMoveToDay?: (occ: EventOccurrence, toDay: Date) => void,
): HTMLElement {
  const mini = document.createElement("div");
  mini.className = "ogenda-month-mini";
  mini.style.borderLeftColor = colors.category(occ.event.category);
  // 紧凑标签:只显示标题,不显示时间(节约空间;时间由视图位置/详情表达)
  mini.textContent = occ.event.title;
  mini.addEventListener("click", () => onEventClick(occ));
  if (onMoveToDay) {
    mini.draggable = true;
    mini.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData(DND_TYPE, occ.event.uid);
      e.dataTransfer!.effectAllowed = "move";
      mini.classList.add("ogenda-month-mini-dragging");
    });
    mini.addEventListener("dragend", () => mini.classList.remove("ogenda-month-mini-dragging"));
  }
  return mini;
}
