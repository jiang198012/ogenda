import { AgendaEvent, getReminderMinutes } from "./event";

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Strips a leading "mailto:" (any case) so a user-typed value never gets double-prefixed. */
function stripMailto(s: string): string {
  return s.replace(/^mailto:/i, "");
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

/** 提前分钟数 → ISO-8601 持续时间(15 → "-PT15M";0 → "PT0S")。 */
export function minutesToIsoDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m === 0) return "PT0S";
  // reminder 语义是「提前」:正数 = 事件开始之前 → 负 duration
  const sign = m > 0 ? "-" : "";
  const abs = Math.abs(m);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  let out = `${sign}P`;
  if (days) out += `${days}D`;
  if (hours || mins) {
    out += "T";
    if (hours) out += `${hours}H`;
    if (mins) out += `${mins}M`;
  }
  return out;
}

/** ISO-8601 持续时间(如 -PT15M)→ 分钟数;无法解析返回 null。 */
export function isoDurationToMinutes(dur: string): number | null {
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(dur.trim().toUpperCase());
  if (!m) return null;
  const d = Number(m[2] ?? 0), h = Number(m[3] ?? 0), mi = Number(m[4] ?? 0), s = Number(m[5] ?? 0);
  const total = d * 1440 + h * 60 + mi + (s > 0 ? 1 : 0); // 秒向上取整到分钟
  return m[1] ? -total : total;
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
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(ev.start)}`);
    // iCloud rejects all-day PUT-creates with no DTEND (empty-body 404) even though
    // RFC 5545 treats it as optional; always send one.
    // An explicit end equal to start means a single-day all-day event.
    const end = ev.end && ev.end > ev.start ? ev.end : addOneDay(ev.start);
    lines.push(`DTEND;VALUE=DATE:${toICalDate(end)}`);
  } else {
    const dt = toICalDateTime(ev.start);
    const zoned = ev.tz && ev.tz !== "floating" && ev.tz !== "UTC" && !dt.endsWith("Z");
    const param = zoned ? `;TZID=${ev.tz}` : "";
    lines.push(`DTSTART${param}:${dt}`);
    // iCloud rejects ANY PUT-create with no DTEND (empty-body 404), timed events included.
    // RFC 5545 defines a missing DTEND as zero duration, so DTEND = DTSTART is the
    // faithful serialization of "no end set".
    lines.push(`DTEND${param}:${ev.end ? toICalDateTime(ev.end) : dt}`);
  }

  if (ev.organizer) lines.push(`ORGANIZER:mailto:${stripMailto(ev.organizer)}`);
  for (const a of ev.attendees ?? []) lines.push(`ATTENDEE:mailto:${stripMailto(a)}`);
  if (ev.status) lines.push(`STATUS:${ev.status.toUpperCase()}`);
  if (ev.category) lines.push(`CATEGORIES:${escapeText(ev.category)}`);
  // RRULE is a structured value, not TEXT: no escapeText (BYDAY lists carry commas).
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  // EXDATE: 与 DTSTART 同时区;全天事件用 VALUE=DATE。合并为一条属性。
  if (ev.exdates && ev.exdates.length) {
    const param = ev.allDay ? ";VALUE=DATE" : zonedParam(ev);
    const vals = ev.exdates
      .map((x) => {
        const v = normalizeSeparator(x);
        return v.includes("T") ? toICalDateTime(v) : toICalDate(v);
      })
      .join(",");
    lines.push(`EXDATE${param}:${vals}`);
  }
  // VALARM:提前 reminder 分钟;0 = 事件开始时。一个事件可以有多个提醒。
  for (const reminder of getReminderMinutes(ev)) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${minutesToIsoDuration(reminder)}`,
      `DESCRIPTION:${escapeText(ev.title)}`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** TZID 参数(与 eventToVCalendar 里 DTSTART 的判定一致)。 */
function zonedParam(ev: AgendaEvent): string {
  const dt = toICalDateTime(ev.start);
  const zoned = ev.tz && ev.tz !== "floating" && ev.tz !== "UTC" && !dt.endsWith("Z");
  return zoned ? `;TZID=${ev.tz}` : "";
}
