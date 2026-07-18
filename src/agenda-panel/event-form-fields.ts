import { AgendaEvent } from "../core/event";

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
  categoryDropdown: string;
  categoryText: string;
  tags: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEventForm(fields: Pick<RawFormFields, "title" | "start">): ValidationResult {
  const errors: string[] = [];
  if (!fields.title.trim()) errors.push("标题不能为空");
  if (!fields.start.trim()) errors.push("开始时间不能为空");
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
  const category = fields.categoryText.trim() || fields.categoryDropdown || undefined;
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
    tags: splitList(fields.tags),
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
