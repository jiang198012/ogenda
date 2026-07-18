export type EventOrigin = "synced" | "local";

export interface AgendaEvent {
  uid: string;
  title: string;
  start: string; // ISO8601, e.g. "2026-07-14T15:00:00"
  end?: string;
  allDay?: boolean;
  tz?: string;
  location?: string;
  url?: string;
  organizer?: string;
  attendees?: string[];
  status?: string;
  rsvp?: string;
  busy?: string;
  category?: string;
  tags?: string[];
  origin: EventOrigin;
  source?: string;
  protocol?: string;
  etag?: string;
  href?: string; // CalDAV resource URL (for conditional write-back in D2)
  seq?: number;
  lastSynced?: string;
  rrule?: string;
}

export function eventToFields(ev: AgendaEvent): Record<string, string> {
  const f: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => {
    if (v !== undefined && v !== "") f[k] = v;
  };
  set("uid", ev.uid);
  set("title", ev.title);
  set("start", ev.start);
  set("end", ev.end);
  if (ev.allDay !== undefined) set("all_day", String(ev.allDay));
  set("tz", ev.tz);
  set("location", ev.location);
  set("url", ev.url);
  set("organizer", ev.organizer);
  if (ev.attendees && ev.attendees.length) set("attendees", ev.attendees.join(", "));
  set("status", ev.status);
  set("rsvp", ev.rsvp);
  set("busy", ev.busy);
  set("category", ev.category);
  if (ev.tags && ev.tags.length) set("tags", ev.tags.join(", "));
  set("origin", ev.origin);
  set("source", ev.source);
  set("protocol", ev.protocol);
  set("etag", ev.etag);
  set("href", ev.href);
  if (ev.seq !== undefined) set("seq", String(ev.seq));
  set("last_synced", ev.lastSynced);
  set("rrule", ev.rrule);
  return f;
}
