import ICAL from "ical.js";
import { AgendaEvent } from "../core/event";

export interface EventOccurrence {
  event: AgendaEvent;
  start: string;
  end?: string;
}

const MAX_ITERATIONS = 10000;

function toIcalTime(iso: string, allDay: boolean | undefined): ICAL.Time {
  return allDay ? ICAL.Time.fromDateString(iso) : ICAL.Time.fromDateTimeString(iso);
}

export function expandOccurrences(
  events: AgendaEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const out: EventOccurrence[] = [];

  for (const ev of events) {
    if (!ev.rrule) {
      const occStart = new Date(ev.start);
      if (occStart >= rangeStart && occStart < rangeEnd) {
        out.push({ event: ev, start: ev.start, end: ev.end });
      }
      continue;
    }

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
        let endStr: string | undefined;
        if (duration) {
          const occEnd = next.clone();
          occEnd.addDuration(duration);
          endStr = occEnd.toString();
        }
        out.push({ event: ev, start: next.toString(), end: endStr });
      }
      next = iter.next();
    }
  }

  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
