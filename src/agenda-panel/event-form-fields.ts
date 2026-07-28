import { AgendaEvent } from "../core/event";
import { getLanguage, t } from "../i18n";

export interface RawFormFields {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string;
  status: string;
  rsvp: string;
  category: string;
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Normalize a lowercase "t" date/time separator (a legacy typo) to uppercase "T". */
function normSep(s: string): string {
  return s.replace(/^(\d{4}-\d{2}-\d{2})[tT]/, "$1T");
}

/** Parse an ISO date or datetime string as LOCAL time (no timezone shift). */
function parseLocal(s: string): Date | null {
  const m = normSep(s.trim());
  if (!m) return null;
  const [datePart, timePart] = m.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const [hh = 0, mi = 0, ss = 0] = timePart ? timePart.split(":").map(Number) : [];
  return new Date(y, mo - 1, d, hh, mi, ss);
}

function fmtLocal(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return dateOnly ? date : `${date}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** ISO (date or datetime) → <input type="datetime-local"> value "YYYY-MM-DDTHH:mm". */
export function isoToDatetimeLocalValue(iso: string): string {
  const s = normSep(iso.trim());
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 16);
  return `${s.slice(0, 10)}T00:00`;
}

/** <input type="datetime-local"> value → ISO datetime with seconds. */
export function datetimeLocalValueToIso(v: string): string {
  const s = normSep(v.trim());
  if (!s) return "";
  if (!s.includes("T")) return `${s.slice(0, 10)}T00:00:00`;
  return `${s.slice(0, 16)}:00`;
}

/** ISO (date or datetime) → <input type="date"> value "YYYY-MM-DD". */
export function isoToDateValue(iso: string): string {
  return normSep(iso.trim()).slice(0, 10);
}

/** <input type="date"> value → date-only ISO. */
export function dateValueToIso(v: string): string {
  return v.trim().slice(0, 10);
}

/**
 * Put a clock time back onto a date-only value, taking it from `previous` when
 * that still carries one and using `fallbackTime` ("HH:MM:SS") otherwise.
 *
 * Leaving all-day mode needs this: the date input can only hand back a bare
 * date, so the time the user typed before switching would be lost.
 */
export function withTimeFrom(dateIso: string, previous: string, fallbackTime: string): string {
  const date = isoToDateValue(dateIso);
  if (!date) return "";
  const p = normSep(previous.trim());
  const time = p.includes("T") ? p.slice(11, 19) : fallbackTime;
  return `${date}T${time.length === 5 ? `${time}:00` : time}`;
}

/** Seed value for a new event's start field, honoring the all-day default. */
export function initialStart(prefill: string, allDay: boolean): string {
  const p = normSep(prefill.trim());
  if (p === "") return "";
  if (allDay) return isoToDateValue(p);
  if (p.includes("T")) return datetimeLocalValueToIso(p);
  return `${isoToDateValue(p)}T09:00:00`;
}

/** Move end to preserve (end − start) when start changes. Empty/invalid end → returned unchanged. */
export function shiftEndWithStart(oldStart: string, oldEnd: string, newStart: string): string {
  if (!oldEnd.trim()) return oldEnd;
  const os = parseLocal(oldStart), oe = parseLocal(oldEnd), ns = parseLocal(newStart);
  if (!os || !oe || !ns) return oldEnd;
  const ne = new Date(ns.getTime() + (oe.getTime() - os.getTime()));
  return fmtLocal(ne, !normSep(oldEnd.trim()).includes("T"));
}

/** Default end for a NEW event: timed → start + 1h; all-day or empty → "". */
export function defaultEndFor(start: string, allDay: boolean): string {
  if (allDay || !start.trim()) return "";
  const s = parseLocal(start);
  if (!s) return "";
  return fmtLocal(new Date(s.getTime() + 3600_000), false);
}

export const RSVP_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "NEEDS-ACTION", labelKey: "rsvp.needsAction" },
  { value: "ACCEPTED", labelKey: "rsvp.accepted" },
  { value: "DECLINED", labelKey: "rsvp.declined" },
  { value: "TENTATIVE", labelKey: "rsvp.tentative" },
];

const CATEGORY_KEYS = ["work", "personal", "study", "meeting", "travel", "health"] as const;

/** Predefined category values, resolved to the current UI language. */
export function getPredefinedCategories(): { value: string; label: string }[] {
  return CATEGORY_KEYS.map((k) => ({ value: t(`category.${k}`), label: t(`category.${k}`) }));
}

/** Default category for new events, in the current UI language. */
export function getDefaultCategory(): string {
  return getLanguage() === "zh" ? "工作" : "Work";
}

export function validateEventForm(fields: {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
}): ValidationResult {
  const errors: string[] = [];
  if (!fields.title.trim()) errors.push(t("validate.titleRequired"));
  if (!fields.start.trim()) errors.push(t("validate.startRequired"));
  if (fields.allDay && fields.end && fields.end.trim()) {
    const s = isoToDateValue(fields.start);
    const e = isoToDateValue(fields.end);
    if (e < s) errors.push(t("validate.allDayEnd"));
  }
  if (!fields.allDay && fields.end && fields.end.trim()) {
    const s = normSep(fields.start.trim());
    const e = normSep(fields.end.trim());
    if (e <= s) errors.push(t("validate.timedEnd"));
  }
  return { valid: errors.length === 0, errors };
}

function splitList(s: string): string[] | undefined {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function buildEventFromFields(
  fields: RawFormFields,
  existing: AgendaEvent | null,
  generateUid: () => string,
): AgendaEvent {
  const category = fields.category.trim() || undefined;
  return {
    uid: existing?.uid ?? generateUid(),
    title: fields.title.trim(),
    start: fields.start.trim(),
    end: fields.end.trim() || undefined,
    allDay: fields.allDay,
    location: fields.location.trim() || undefined,
    organizer: fields.organizer.trim() || undefined,
    attendees: splitList(fields.attendees),
    status: fields.status || undefined,
    rsvp: fields.rsvp.trim() || undefined,
    category,
    description: fields.description.trim() || undefined,
    origin: existing?.origin ?? "local",
    href: existing?.href,
    etag: existing?.etag,
    baseHash: existing?.baseHash,
    rrule: existing?.rrule,
    tz: existing?.tz,
    url: existing?.url,
    busy: existing?.busy,
    source: existing?.source,
    protocol: existing?.protocol,
    serverDeleted: existing?.serverDeleted,
    seq: existing?.seq,
    lastSynced: existing?.lastSynced,
  };
}

/** Enter saves the form — except during IME composition, inside the multi-line textarea, or when save is disabled. */
export function shouldSaveOnEnter(
  key: string,
  isComposing: boolean,
  targetIsTextarea: boolean,
  saveDisabled: boolean,
): boolean {
  return key === "Enter" && !isComposing && !targetIsTextarea && !saveDisabled;
}
