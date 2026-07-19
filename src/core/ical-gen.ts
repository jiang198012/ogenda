import { AgendaEvent } from "./event";

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Normalizes a lowercase "t" date/time separator (a common manual-entry typo) to uppercase "T". */
function normalizeSeparator(iso: string): string {
  return iso.replace(/^(\d{4}-\d{2}-\d{2})t/, "$1T");
}

/** "2026-07-14T15:00:00" -> "20260714T150000"; a trailing Z is preserved. */
function toICalDateTime(iso: string): string {
  return normalizeSeparator(iso).replace(/[-:]/g, "");
}

/** "2026-07-14" or "2026-07-14T..." -> "20260714". */
function toICalDate(iso: string): string {
  return normalizeSeparator(iso).split("T")[0].replace(/-/g, "");
}

/** "2026-07-14" -> "2026-07-15" (handles month/year rollover). */
function addOneDay(dateOnly: string): string {
  const [y, m, d] = normalizeSeparator(dateOnly).split("T")[0].split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
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
    // iCloud rejects all-day PUT-creates with no DTEND (empty-body 404) even though
    // RFC 5545 treats it as optional; always send one, defaulting to a 1-day span.
    const end = ev.end ?? addOneDay(ev.start);
    lines.push(`DTEND;VALUE=DATE:${toICalDate(end)}`);
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
