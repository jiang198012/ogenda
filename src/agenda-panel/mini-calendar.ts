import { monthGridWeeks, startOfDay } from "./date-grid";

export function renderMiniCalendar(container: HTMLElement, anchor: Date, onDayClick: (day: Date) => void): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "ogenda-mini-cal";

  const header = document.createElement("div");
  header.className = "ogenda-mini-cal-header";
  header.textContent = `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
  wrap.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "ogenda-mini-cal-grid";

  const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  for (const label of weekdayLabels) {
    const dow = document.createElement("div");
    dow.className = "ogenda-mini-cal-dow";
    dow.textContent = label;
    grid.appendChild(dow);
  }

  const weeks = monthGridWeeks(anchor);
  const month = anchor.getMonth();
  const anchorDay = startOfDay(anchor);

  for (const week of weeks) {
    for (const day of week) {
      const cell = document.createElement("div");
      cell.className = "ogenda-mini-cal-cell";
      if (day.getMonth() !== month) cell.classList.add("ogenda-mini-cal-othermonth");
      if (day.getTime() === anchorDay.getTime()) cell.classList.add("ogenda-mini-cal-selected");
      cell.textContent = String(day.getDate());
      cell.addEventListener("click", () => onDayClick(day));
      grid.appendChild(cell);
    }
  }
  wrap.appendChild(grid);
  container.appendChild(wrap);
}
