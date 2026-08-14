import ICAL from "ical.js";
import { AgendaEvent } from "./event";
import { isoDurationToMinutes } from "./ical-gen";

export function icalToEvents(ics: string, source: string, protocol = "imap"): AgendaEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  const vevents = comp.getAllSubcomponents("vevent");
  const out: AgendaEvent[] = [];
  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    const start = ev.startDate;
    if (!start) continue; // malformed VEVENT without DTSTART — skip, don't crash the whole feed
    const end = ev.endDate;
    const organizer = ve.getFirstPropertyValue("organizer");
    const attendees = ve
      .getAllProperties("attendee")
      .map((p) => String(p.getFirstValue() ?? ""))
      .filter((s) => s.length > 0);
    const status = ve.getFirstPropertyValue("status");
    const rrule = ve.getFirstPropertyValue("rrule");
    const description = ve.getFirstPropertyValue("description");
    // Multi-value CATEGORIES: only the first value is kept (documented limitation).
    const categories = ve.getFirstPropertyValue("categories");
    out.push({
      uid: ev.uid,
      title: ev.summary || "(no title)",
      start: start ? start.toString() : "",
      end: end ? end.toString() : undefined,
      allDay: start ? start.isDate : undefined,
      tz: start && start.zone && start.zone.tzid && start.zone.tzid !== "floating" ? start.zone.tzid : undefined,
      location: ev.location || undefined,
      organizer: organizer ? String(organizer).replace(/^mailto:/i, "") : undefined,
      attendees: attendees.length ? attendees.map((a) => a.replace(/^mailto:/i, "")) : undefined,
      status: status ? String(status).toLowerCase() : undefined,
      rrule: rrule ? String(rrule.toString()) : undefined,
      description: description ? String(description) : undefined,
      category: categories ? String(categories) : undefined,
      exdates: parseExdates(ve),
      reminder: parseReminderMinutes(ve, start),
      origin: "synced",
      source,
      protocol,
    });
  }
  return out;
}

/** EXDATE 属性 → ISO 字符串数组("2026-07-15" / "2026-07-15T15:00:00")。 */
function parseExdates(ve: ICAL.Component): string[] | undefined {
  const props = ve.getAllProperties("exdate");
  if (!props.length) return undefined;
  const out: string[] = [];
  for (const p of props) {
    const v = p.getFirstValue();
    if (v instanceof ICAL.Time) out.push(v.toString());
  }
  return out.length ? out : undefined;
}

/** VALARM DISPLAY 的 TRIGGER → 提前分钟数(相对于 DTSTART);无有效提醒返回 undefined。 */
function parseReminderMinutes(ve: ICAL.Component, start: ICAL.Time): number | undefined {
  const alarm = ve.getAllSubcomponents("valarm")[0];
  if (!alarm) return undefined;
  const action = alarm.getFirstPropertyValue("action");
  if (action && String(action).toUpperCase() !== "DISPLAY") return undefined;
  const trigger = alarm.getFirstPropertyValue("trigger");
  if (trigger === undefined || trigger === null) return undefined;
  if (trigger instanceof ICAL.Time) {
    // 绝对触发时间:相对 DTSTART 的提前量(可能为负 = 事后提醒,不采信 → undefined)
    const before = Math.round((start.toUnixTime() - trigger.toUnixTime()) / 60);
    return before >= 0 ? before : undefined;
  }
  const str = String(trigger);
  if (!str.startsWith("P") && !str.startsWith("-P")) return undefined;
  const minutes = isoDurationToMinutes(str);
  if (minutes === null) return undefined;
  // 只接受「提前」(负 duration);事后提醒(正 duration)不采信
  return minutes < 0 ? -minutes : 0;
}
