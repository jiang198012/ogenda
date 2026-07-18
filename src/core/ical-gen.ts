import { AgendaEvent } from "./event";

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "2026-07-14T15:00:00" -> "20260714T150000"; a trailing Z is preserved. */
function toICalDateTime(iso: string): string {
  return iso.replace(/[-:]/g, "");
}

/** "2026-07-14" or "2026-07-14T..." -> "20260714". */
function toICalDate(iso: string): string {
  return iso.split("T")[0].replace(/-/g, "");
}

/** Serialize an AgendaEvent to a minimal VCALENDAR (one VEVENT) for a CalDAV PUT. */
export function eventToVCalendar(ev: AgendaEvent): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ogenda//EN",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `SUMMARY:${escapeText(ev.title)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(ev.start)}`);
    if (ev.end) lines.push(`DTEND;VALUE=DATE:${toICalDate(ev.end)}`);
  } else {
    const dt = toICalDateTime(ev.start);
    const zoned = ev.tz && ev.tz !== "floating" && ev.tz !== "UTC" && !dt.endsWith("Z");
    const param = zoned ? `;TZID=${ev.tz}` : "";
    lines.push(`DTSTART${param}:${dt}`);
    if (ev.end) lines.push(`DTEND${param}:${toICalDateTime(ev.end)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
