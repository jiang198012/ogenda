import { AgendaEvent } from "../core/event";
import { EventOccurrence, expandOccurrences, parseLocalDate } from "./occurrences";
import { addDays, startOfDay, toDateKey } from "./date-grid";
import { formatDayShort } from "./date-format";
import { getLanguage, t } from "../i18n";

export type AgendaTextStyle = "plain" | "markdown";

export interface AgendaText {
  text: string;
  /** 事件行数(没有事件的天整天略过,不计入)。 */
  count: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDateTime = (d: Date) => `${fmtDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/**
 * 把一条 occurrence 按日历天切成逐日切片。expandOccurrences 对非重复事件已经逐日裁剪,
 * 但 rrule 分支的每个实例是完整跨度(周视图贯通横条依赖这一形态,不能动它)——
 * 文本导出按天分组,必须在这里统一切齐,否则多日实例只出现在首日、
 * 时间标签倒挂成 "15:00-10:00"。裁剪规则与 expandSingleEvent 一致:
 * 全天实例 end 排他逐日发日期片;定时实例逐日夹取 [day, day+1) 与 [start, end) 的交集。
 */
function clipToDays(occ: EventOccurrence, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const start = parseLocalDate(occ.start);
  const end = occ.end ? parseLocalDate(occ.end) : undefined;
  if (occ.event.allDay) {
    // 单日全天(end 缺省或等于 start,同 expandSingleEvent 的语义)原样返回
    if (!end || end.getTime() <= startOfDay(start).getTime()) return [occ];
    const out: EventOccurrence[] = [];
    for (let d = startOfDay(start); d < end; d = addDays(d, 1)) {
      if (d >= rangeEnd) break;
      if (d >= rangeStart) out.push({ event: occ.event, start: fmtDate(d), end: fmtDate(addDays(d, 1)) });
    }
    return out;
  }
  if (!end) return [occ];
  const out: EventOccurrence[] = [];
  for (let day = startOfDay(start); day <= startOfDay(end); day = addDays(day, 1)) {
    if (day >= rangeEnd) break;
    const dayEnd = addDays(day, 1);
    if (dayEnd <= rangeStart) continue;
    const clipStart = start > day ? start : day;
    const clipEnd = end < dayEnd ? end : dayEnd;
    if (clipStart < clipEnd) out.push({ event: occ.event, start: fmtDateTime(clipStart), end: fmtDateTime(clipEnd) });
  }
  return out;
}

/**
 * 行首时间标签:全天事件、以及跨天事件被裁剪后覆盖整天的中间切片 → 「全天」;
 * 截止于午夜的首日切片显示 24:00(比 00:00 更不容易读错)。
 */
function timeLabel(occ: EventOccurrence): string {
  if (occ.event.allDay) return t("view.allDay");
  const startT = occ.start.includes("T") ? occ.start.slice(11, 16) : "";
  if (!occ.end) return startT;
  const endT = occ.end.includes("T") ? occ.end.slice(11, 16) : "";
  const crossesMidnight = occ.end.slice(0, 10) > occ.start.slice(0, 10);
  if (crossesMidnight && startT === "00:00" && endT === "00:00") return t("view.allDay");
  return `${startT}-${crossesMidnight && endT === "00:00" ? "24:00" : endT}`;
}

/**
 * 把 [start, end) 内的事件格式化为文本日程:按天分组、展开重复/跨天事件,
 * 没有事件的天整组略过;全天行排在当日定时行之前(expandOccurrences 的排序天然如此)。
 * 与面板渲染共用同一条事件管线,保证导出的文本与面板所见一致。
 */
export function buildAgendaText(
  events: AgendaEvent[],
  start: Date,
  end: Date,
  style: AgendaTextStyle,
): AgendaText {
  const lang = getLanguage();
  const rangeStart = startOfDay(start);
  const byDay = new Map<string, EventOccurrence[]>();
  for (const occ of expandOccurrences(events, start, end)) {
    for (const slice of clipToDays(occ, rangeStart, end)) {
      const key = slice.start.slice(0, 10);
      const list = byDay.get(key);
      if (list) list.push(slice);
      else byDay.set(key, [slice]);
    }
  }
  const blocks: string[] = [];
  let count = 0;
  for (let d = rangeStart; d < end; d = addDays(d, 1)) {
    const rows = byDay.get(toDateKey(d));
    if (!rows || rows.length === 0) continue;
    const header = formatDayShort(d, lang);
    const lines = [style === "markdown" ? `**${header}**` : header];
    for (const occ of rows) {
      const loc = occ.event.location ? ` @${occ.event.location}` : "";
      const row = `${timeLabel(occ)} ${occ.event.title}${loc}`;
      lines.push(style === "markdown" ? `- ${row}` : row);
      count++;
    }
    blocks.push(lines.join("\n"));
  }
  return { text: blocks.join("\n\n"), count };
}
