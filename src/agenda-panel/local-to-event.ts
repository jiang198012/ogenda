import { AgendaEvent, unescapeMultiline } from "../core/event";
import { LocalEvent } from "../store/monthly-store";

// MonthlyStore.readEvents() 返回原始字段(LocalEvent, snake_case),不是 AgendaEvent。
// 面板展示/编辑用此函数转换。带上 href/etag/base_hash/tz 与真实 origin,让表单编辑往返
// 不丢同步元数据 —— buildEventFromFields 的字段保留逻辑读的正是 existing 上这些字段。
export function localToEvent(local: LocalEvent): AgendaEvent {
  const f = local.fields;
  return {
    uid: local.uid,
    title: f.title ?? "",
    start: f.start ?? "",
    end: f.end,
    allDay: f.all_day === "true",
    tz: f.tz,
    location: f.location,
    organizer: f.organizer,
    attendees: f.attendees ? f.attendees.split(", ") : undefined,
    status: f.status,
    rsvp: f.rsvp,
    category: f.category,
    tags: f.tags ? f.tags.split(", ") : undefined,
    rrule: f.rrule,
    description: f.description ? unescapeMultiline(f.description) : undefined,
    origin: f.origin === "local" ? "local" : "synced",
    href: f.href,
    etag: f.etag,
    baseHash: f.base_hash,
  };
}
