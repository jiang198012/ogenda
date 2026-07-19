import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";

function addField(grid: HTMLElement, label: string, value: string | undefined): void {
  if (!value) return;
  const row = document.createElement("div");
  row.className = "ogenda-field-row";
  const k = document.createElement("span");
  k.className = "ogenda-field-key";
  k.textContent = label;
  const v = document.createElement("span");
  v.className = "ogenda-field-value";
  v.textContent = value;
  row.appendChild(k);
  row.appendChild(v);
  grid.appendChild(row);
}

function formatTime(occ: EventOccurrence): string {
  if (occ.event.allDay) return "全天";
  const hhmm = (iso?: string) => (iso ? iso.slice(11, 16) : "");
  const e = hhmm(occ.end);
  return e ? `${hhmm(occ.start)}–${e}` : hhmm(occ.start);
}

export function renderDayView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  onEventClick: (event: AgendaEvent) => void,
  colors: ColorResolver = createColorResolver(),
): void {
  container.innerHTML = "";
  for (const occ of occurrences) {
    const ev = occ.event;
    const card = document.createElement("div");
    card.className = "ogenda-day-card";
    card.style.borderLeftColor = colors.category(ev.category);
    card.addEventListener("click", () => onEventClick(ev));

    const time = document.createElement("div");
    time.className = "ogenda-day-time";
    time.textContent = formatTime(occ);
    card.appendChild(time);

    const titleRow = document.createElement("div");
    titleRow.className = "ogenda-day-titlerow";
    const title = document.createElement("div");
    title.className = "ogenda-day-title";
    title.textContent = ev.title;
    titleRow.appendChild(title);
    if ((ev.status ?? "").trim() !== "") {
      const st = statusStyle(ev.status);
      const pill = document.createElement("span");
      pill.className = "ogenda-status-pill";
      pill.textContent = st.label;
      pill.style.color = st.text;
      pill.style.background = st.bg;
      titleRow.appendChild(pill);
    }
    card.appendChild(titleRow);

    const grid = document.createElement("div");
    grid.className = "ogenda-field-grid";
    addField(grid, "地点", ev.location);
    addField(grid, "组织者", ev.organizer);
    addField(grid, "参与人", ev.attendees?.length ? ev.attendees.join("、") : undefined);
    addField(grid, "RSVP", ev.rsvp);
    addField(grid, "分类", ev.category);
    addField(grid, "标签", ev.tags?.length ? ev.tags.join("、") : undefined);
    addField(grid, "重复规则", ev.rrule);
    card.appendChild(grid);

    container.appendChild(card);
  }
}
