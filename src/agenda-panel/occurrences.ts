import ICAL from "ical.js";
import { AgendaEvent } from "../core/event";
import { startOfDay, addDays } from "./date-grid";

export interface EventOccurrence {
  event: AgendaEvent;
  start: string;
  end?: string;
}

export function parseLocalDate(s: string): Date {
  if (s.includes("T")) return new Date(s);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MAX_ITERATIONS = 10000;

/** 去掉 ISO 末尾的 UTC "Z" 后缀(比较 EXDATE 时两侧统一)。 */
function normIso(s: string): string {
  return s.endsWith("Z") ? s.slice(0, -1) : s;
}

function toIcalTime(iso: string, allDay: boolean | undefined): ICAL.Time {
  return allDay ? ICAL.Time.fromDateString(iso) : ICAL.Time.fromDateTimeString(iso);
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fmtDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function expandSingleEvent(ev: AgendaEvent, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const occStart = parseLocalDate(ev.start);
  const occEnd = ev.end ? parseLocalDate(ev.end) : undefined;

  // All-day event with no explicit end, or explicit end equal to start: single day on start.
  if (ev.allDay && (!occEnd || occEnd.getTime() === startOfDay(occStart).getTime())) {
    if (occStart >= rangeStart && occStart < rangeEnd) {
      out.push({ event: ev, start: ev.start, end: ev.end });
    }
    return out;
  }

  // Multi-day all-day event: end date is exclusive (iCalendar semantics).
  // Spans every day from start up to (but not including) end.
  if (ev.allDay && occEnd) {
    for (let d = startOfDay(occStart); d < occEnd; d = addDays(d, 1)) {
      if (d >= rangeEnd) break;
      if (d >= rangeStart) {
        const dayStart = fmtDate(d);
        const dayEnd = fmtDate(addDays(d, 1));
        out.push({ event: ev, start: dayStart, end: dayEnd });
      }
    }
    return out;
  }

  // Timed event: span from start datetime to end datetime, generating one clipped
  // occurrence per calendar day that overlaps the range.
  if (!ev.allDay) {
    if (!occEnd) {
      if (occStart >= rangeStart && occStart < rangeEnd) {
        out.push({ event: ev, start: ev.start, end: ev.end });
      }
      return out;
    }

    for (let day = startOfDay(occStart); day <= startOfDay(occEnd); day = addDays(day, 1)) {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      if (dayStart >= rangeEnd) break;
      if (dayEnd <= rangeStart) continue;

      const clipStart = occStart > dayStart ? occStart : dayStart;
      const clipEnd = occEnd < dayEnd ? occEnd : dayEnd;
      if (clipStart < clipEnd) {
        out.push({ event: ev, start: fmtDateTime(clipStart), end: fmtDateTime(clipEnd) });
      }
    }
  }

  return out;
}

export function expandOccurrences(
  events: AgendaEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const out: EventOccurrence[] = [];

  for (const ev of events) {
    if (!ev.rrule) {
      out.push(...expandSingleEvent(ev, rangeStart, rangeEnd));
      continue;
    }

    // EXDATE 排除的实例:两侧都去掉 UTC 后缀再比较(浮时区/本地时间为 wall-time)。
    const excluded = new Set((ev.exdates ?? []).map(normIso));
    const dtstart = toIcalTime(ev.start, ev.allDay);
    const duration = ev.end ? toIcalTime(ev.end, ev.allDay).subtractDate(dtstart) : null;
    const recur = ICAL.Recur.fromString(ev.rrule);
    const iter = recur.iterator(dtstart);

    let next = iter.next();
    let count = 0;
    while (next && count < MAX_ITERATIONS) {
      count++;
      const occStart = next.toJSDate();
      if (occStart >= rangeEnd) break;
      if (occStart >= rangeStart) {
        const startStr = normIso(next.toString());
        if (!excluded.has(startStr)) {
          let endStr: string | undefined;
          if (duration) {
            const occEnd = next.clone();
            occEnd.addDuration(duration);
            endStr = occEnd.toString();
          }
          out.push({ event: ev, start: startStr, end: endStr });
        }
      }
      next = iter.next();
    }
  }

  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
