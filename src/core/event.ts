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
  /** EXDATE 排除的重复实例(ISO datetime/date,与 start 同格式)。 */
  exdates?: string[];
  /** 提醒提前量(分钟,0 = 事件开始时);可同时设置多个,写入多个服务器 VALARM。 */
  reminders?: number[];
  /** @deprecated 单提醒旧字段;读取时会兼容并映射为 reminders。 */
  reminder?: number;
}

/** Returns the event's reminder offsets, accepting the legacy single-value field. */
export function getReminderMinutes(ev: Pick<AgendaEvent, "reminders" | "reminder">): number[] {
  const values = ev.reminders !== undefined ? ev.reminders : ev.reminder === undefined ? [] : [ev.reminder];
  return values.filter((value) => Number.isFinite(value)).map((value) => Math.round(value));
}

const REMINDER_UNIT_RE = /(-?\d+)(分钟|分|minutes?|mins?|min|m|小时|时|hours?|hrs?|hr|h|天|日|days?|day|d)/gi;

function reminderUnitMinutes(unit: string): number {
  const normalized = unit.toLowerCase();
  if (["天", "日", "day", "days", "d"].includes(normalized)) return 1440;
  if (["小时", "时", "hour", "hours", "hr", "hrs", "h"].includes(normalized)) return 60;
  return 1;
}

function parseReminderPart(raw: string): number | undefined {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return undefined;
  if (/^-?\d+$/.test(compact)) {
    const minutes = Number(compact);
    return Number.isFinite(minutes) ? minutes : undefined;
  }

  let cursor = 0;
  let total = 0;
  let matched = false;
  for (const match of compact.matchAll(REMINDER_UNIT_RE)) {
    if (match.index !== cursor) return undefined;
    const amount = Number(match[1]);
    const minutes = amount * reminderUnitMinutes(match[2]);
    if (!Number.isFinite(amount) || !Number.isFinite(minutes)) return undefined;
    total += minutes;
    if (!Number.isFinite(total)) return undefined;
    cursor += match[0].length;
    matched = true;
  }
  return matched && cursor === compact.length ? total : undefined;
}

/** Parses comma-separated reminder values; bare integers remain minute-compatible. */
export function parseReminderMinutes(raw: string | undefined): number[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const values = raw.split(",").map(parseReminderPart);
  return values.every((value): value is number => value !== undefined) ? values : undefined;
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
  if (ev.exdates && ev.exdates.length) set("exdates", ev.exdates.join(", "));
  const reminderMinutes = getReminderMinutes(ev);
  if (ev.reminders !== undefined) {
    if (reminderMinutes.length) set("reminders", reminderMinutes.join(", "));
  } else if (ev.reminder !== undefined) {
    // Keep the old field for legacy single-reminder events until they are edited
    // or otherwise represented with the new array field.
    set("reminder", String(ev.reminder));
  }
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
 * Local-only fields (rsvp) and parse-only fields (rrule) are not hashed.
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
  // 提醒与 EXDATE 都会写回服务器(VALARM / EXDATE),参与本地改动检测。
  const reminderMinutes = getReminderMinutes(ev);
  if (reminderMinutes.length) {
    // A single reminder keeps the old hash namespace so upgrading an existing
    // one-reminder event does not look like a content edit.
    const canonical = reminderMinutes.length === 1 ? reminderMinutes : [...reminderMinutes].sort((a, b) => a - b);
    canon.push(`${canonical.length === 1 ? "reminder" : "reminders"}\0${canonical.join(",")}`);
  }
  if (ev.exdates && ev.exdates.length) canon.push(`exdates\0${ev.exdates.join(",")}`);
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
