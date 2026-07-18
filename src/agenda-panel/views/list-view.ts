import { AgendaEvent } from "../../core/event";
import { EventOccurrence } from "../occurrences";

const STATUS_ORDER = ["confirmed", "tentative", "cancelled"];

interface StatusGroup {
  label: string;
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
  return orderedKeys.map((key) => ({ label: key || "未设置", items: buckets.get(key)! }));
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
): void {
  container.innerHTML = "";
  for (const group of groupByStatus(occurrences)) {
    const groupEl = document.createElement("div");
    groupEl.className = "ogenda-list-statusgroup";

    const header = document.createElement("div");
    header.className = "ogenda-list-statusheader";
    header.textContent = `${group.label} (${group.items.length})`;

    const itemsEl = document.createElement("div");
    itemsEl.className = "ogenda-list-statusitems";

    header.addEventListener("click", () => {
      itemsEl.classList.toggle("collapsed");
    });
    groupEl.appendChild(header);

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

      itemsEl.appendChild(row);
    }
    groupEl.appendChild(itemsEl);
    container.appendChild(groupEl);
  }
}
