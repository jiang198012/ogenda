import { AgendaEvent } from "../../core/event";
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { startOfWeek, startOfDay, addDays } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";
import { t } from "../../i18n";

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return t("view.allDay");
  return occ.start.slice(11, 16);
}

export function renderWeekView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (event: AgendaEvent) => void,
  onEmptyClick?: (day: Date) => void,
  colors: ColorResolver = createColorResolver(),
): void {
  container.innerHTML = "";
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const grid = document.createElement("div");
  grid.className = "ogenda-week-grid";

  const weekdayLabels = t("weekday.long").split(",");

  for (let i = 0; i < days.length; i++) {
    const head = document.createElement("div");
    head.className = "ogenda-week-col-head";
    head.textContent = `${weekdayLabels[i]} ${days[i].getDate()}`;
    grid.appendChild(head);
  }

  for (const day of days) {
    const col = document.createElement("div");
    col.className = "ogenda-week-col";
    if (onEmptyClick) {
      col.addEventListener("click", (e) => {
        if (e.target === col) onEmptyClick(day);
      });
    }

    const dayOccs = occurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
    for (const occ of dayOccs) {
      const card = document.createElement("div");
      card.className = "ogenda-week-card";
      card.style.borderLeftColor = colors.category(occ.event.category);
      card.addEventListener("click", () => onEventClick(occ.event));

      const time = document.createElement("div");
      time.className = "ogenda-week-card-time";
      time.textContent = formatTime(occ);
      card.appendChild(time);

      const title = document.createElement("div");
      title.className = "ogenda-week-card-title";
      title.textContent = occ.event.title;
      card.appendChild(title);

      if (occ.event.location) {
        const loc = document.createElement("div");
        loc.className = "ogenda-week-card-loc";
        loc.textContent = occ.event.location;
        card.appendChild(loc);
      }

      col.appendChild(card);
    }
    grid.appendChild(col);
  }
  container.appendChild(grid);
}
