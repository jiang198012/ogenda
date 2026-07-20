import ICAL from "ical.js";
import { AgendaEvent } from "./event";

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
      origin: "synced",
      source,
      protocol,
    });
  }
  return out;
}
