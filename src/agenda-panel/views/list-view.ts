import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { groupByDay } from "../date-grid";

function formatDayLabel(d: Date, today: Date): string {
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameDay ? `今天 · ${dateStr} ${weekday}` : `${dateStr} ${weekday}`;
}

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
  const s = hhmm(occ.start);
  const e = hhmm(occ.end);
  return e ? `${s}–${e}` : s;
}

export function renderListView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  today: Date,
  onEventClick: (event: AgendaEvent) => void,
): void {
  container.innerHTML = "";
  for (const group of groupByDay(occurrences)) {
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-daygroup";

    const label = document.createElement("div");
    label.className = "ogenda-list-daylabel";
    label.textContent = formatDayLabel(group.date, today);
    groupEl.appendChild(label);

    for (const occ of group.items) {
      const row = document.createElement("div");
      row.className = "ogenda-event-row";
      row.addEventListener("click", () => onEventClick(occ.event));

      const time = document.createElement("span");
      time.className = "ogenda-event-time";
      time.textContent = formatTime(occ);
      row.appendChild(time);

      const title = document.createElement("span");
      title.className = "ogenda-event-title";
      title.textContent = occ.event.title;
      row.appendChild(title);

      if (occ.event.location) {
        const loc = document.createElement("span");
        loc.className = "ogenda-event-loc";
        loc.textContent = occ.event.location;
        row.appendChild(loc);
      }

      groupEl.appendChild(row);
    }
    container.appendChild(groupEl);
  }
}
