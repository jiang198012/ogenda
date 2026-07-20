export type EventOrigin = "synced" | "local";

export interface AgendaEvent {
  uid: string;
  title: string;
  start: string; // ISO8601, e.g. "2026-07-14T15:00:00"
  end?: string;
  allDay?: boolean;
  tz?: string;
  location?: string;
  description?: string;
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
  baseHash?: string; // hash of calendar fields at last sync (local-change detection)
  serverDeleted?: boolean; // sync-metadata: marks event deleted on server (D3)
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
  if (ev.description !== undefined && ev.description !== "") f.description = escapeMultiline(ev.description);
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
  set("base_hash", ev.baseHash);
  set("server_deleted", ev.serverDeleted ? "true" : undefined);
  if (ev.seq !== undefined) set("seq", String(ev.seq));
  set("last_synced", ev.lastSynced);
  set("rrule", ev.rrule);
  return f;
}

/**
 * Hash of the calendar-meaningful fields (what gets written back to the server).
 * Metadata (etag/href/base_hash/source/protocol/origin) is intentionally excluded,
 * so a re-sync that only refreshes metadata does not look like a local edit.
 *
 * The five base fields always take fixed positions. The extended fields
 * (description/organizer/attendees/status/category) are appended ONLY when
 * non-empty, each tagged with its field name, so:
 *   - an event with none of them hashes byte-identically to the pre-extension
 *     algorithm (no mass re-push of the whole calendar on upgrade), and
 *   - "description=X only" never collides with "organizer=X only".
 * Local-only fields (rsvp/tags) and parse-only fields (rrule) are not hashed.
 */
export function hashEvent(ev: AgendaEvent): string {
  const canon = [
    ev.title ?? "",
    ev.start ?? "",
    ev.end ?? "",
    ev.allDay === undefined ? "" : String(ev.allDay),
    ev.location ?? "",
  ];
  if (ev.description) canon.push(`description\0${ev.description}`);
  if (ev.organizer) canon.push(`organizer\0${ev.organizer}`);
  if (ev.attendees && ev.attendees.length) canon.push(`attendees\0${ev.attendees.join(", ")}`);
  if (ev.status) canon.push(`status\0${ev.status}`);
  if (ev.category) canon.push(`category\0${ev.category}`);
  const joined = canon.join("\0");
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Escapes a multi-line string for single-line md field storage: `\` → `\\`, newline → `\n`. */
export function escapeMultiline(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
}

/** Exact inverse of escapeMultiline: `\\` → `\`, `\n` → newline. */
export function unescapeMultiline(s: string): string {
  return s.replace(/\\(\\|n)/g, (_m, c) => (c === "n" ? "\n" : "\\"));
}
