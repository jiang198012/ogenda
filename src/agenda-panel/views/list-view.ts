import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";
import { ColorResolver, createColorResolver, statusStyle } from "../colors";

const STATUS_ORDER = ["confirmed", "tentative", "cancelled"];

interface StatusGroup {
  key: string;
  items: EventOccurrence[];
}

function groupByStatus(occurrences: EventOccurrence[]): StatusGroup[] {
  const buckets = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const key = occ.event.status?.trim() || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(occ);
  }
  for (const items of buckets.values()) {
    items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }
  const knownKeys = STATUS_ORDER.filter((s) => buckets.has(s));
  const otherKeys = [...buckets.keys()].filter((k) => k !== "" && !STATUS_ORDER.includes(k)).sort();
  const orderedKeys = [...knownKeys, ...otherKeys];
  if (buckets.has("")) orderedKeys.push("");
  return orderedKeys.map((key) => ({ key, items: buckets.get(key)! }));
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
  onEventClick: (event: AgendaEvent) => void,
  colors: ColorResolver = createColorResolver(),
): void {
  container.innerHTML = "";
  for (const group of groupByStatus(occurrences)) {
    const st = statusStyle(group.key);
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-statusgroup";

    const header = document.createElement("div");
    header.className = "ogenda-list-statusheader";
    header.textContent = `${st.label} · ${group.items.length}`;

    const itemsEl = document.createElement("div");
    itemsEl.className = "ogenda-list-statusitems";
    header.addEventListener("click", () => itemsEl.classList.toggle("collapsed"));
    groupEl.appendChild(header);

    for (const occ of group.items) {
      const ev = occ.event;
      const row = document.createElement("div");
      row.className = "ogenda-event-row";
      row.style.borderLeftColor = colors.category(ev.category);
      row.addEventListener("click", () => onEventClick(ev));

      const time = document.createElement("span");
      time.className = "ogenda-event-time";
      time.textContent = formatTime(occ);
      row.appendChild(time);

      const main = document.createElement("div");
      main.className = "ogenda-event-main";
      const title = document.createElement("div");
      title.className = "ogenda-event-title";
      title.textContent = ev.title;
      main.appendChild(title);
      if (ev.location) {
        const loc = document.createElement("div");
        loc.className = "ogenda-event-loc";
        loc.textContent = ev.location;
        main.appendChild(loc);
      }
      row.appendChild(main);

      if ((ev.status ?? "").trim() !== "") {
        const pill = document.createElement("span");
        pill.className = "ogenda-status-pill";
        pill.textContent = st.label;
        pill.style.color = st.text;
        pill.style.background = st.bg;
        row.appendChild(pill);
      }
      if (ev.category) {
        const cat = document.createElement("span");
        cat.className = "ogenda-cat-pill";
        cat.textContent = ev.category;
        cat.style.color = colors.category(ev.category);
        cat.style.background = colors.categoryPillBg(ev.category);
        row.appendChild(cat);
      }

      itemsEl.appendChild(row);
    }
    groupEl.appendChild(itemsEl);
    container.appendChild(groupEl);
  }
}
