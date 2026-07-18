import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { monthGridWeeks, startOfDay } from "../date-grid";

export function renderMonthView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();

  const grid = document.createElement("div");
  grid.className = "ogenda-month-grid";

  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
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

      const num = document.createElement("div");
      num.className = "ogenda-month-daynum";
      num.textContent = String(day.getDate());
      cell.appendChild(num);

      const dayOccs = occurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
      for (const occ of dayOccs) {
        const mini = document.createElement("div");
        mini.className = "ogenda-month-mini";
        mini.textContent = occ.event.title;
        mini.addEventListener("click", () => onEventClick(occ.event));
        cell.appendChild(mini);
      }

      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
}
