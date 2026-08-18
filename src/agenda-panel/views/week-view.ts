// 周视图:7 列 × 24h 时间格(共享 renderTimeGrid)+ 顶部贯通横条区 + 贯通时间线。
// 贯通横条区:全天事件与跨天 timed 事件统一渲染为跨列横条(重叠自动分车道),
// 不再把多天的列填满;横条事件不参与时间格与可见窗口的计算。
// 整周使用统一可见窗口(分区范围 ∪ 整周单日事件范围),各列高度一致;
// 时间刻度用省略版:只画 06:00 / 12:00 / 18:00 三条从左到右贯通的线。
// 交互:点空白 → 该时刻新建;拖拽划范围;拖卡片移动/改时长;跨列拖到另一天。
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { startOfWeek, startOfDay, addDays, toDateKey } from "../date-grid";
import { ColorResolver, createColorResolver } from "../colors";
import { TimeSegment } from "../time-segments";
import { weekWindowRange, layoutWeekSpans, WeekSpanItem } from "../day-grid";
import { formatDayShort } from "../date-format";
import { renderTimeGrid, TimeGridHandlers } from "./time-grid";
import { t, getLanguage } from "../../i18n";

// Mon..Sun: weekdays cool, weekend warm.
const WEEK_COLORS = ["#3B82F6", "#22C55E", "#06B6D4", "#A855F7", "#64748B", "#F59E0B", "#EF4444"];
/** 每小时像素高度(周视图比日视图紧凑)。 */
export const WEEK_HOUR_PX = 28;
/** 省略版时间刻度:每 6 小时一条贯通线。 */
const TIMELINE_HOURS = [6, 12, 18];

const DND_TYPE = "text/ogenda-uid";

/** 横条 tooltip:全天单日 = “全天”;多天 = 日期范围;跨天 timed = 带时刻的范围。 */
function spanTooltip(span: WeekSpanItem): string {
  const lang = getLanguage();
  const ev = span.occ.event;
  if (ev.allDay) {
    const single =
      span.endTs <= span.startTs ||
      startOfDay(new Date(span.endTs - 1)).getTime() === startOfDay(new Date(span.startTs)).getTime();
    if (single) return t("view.allDay");
    return `${formatDayShort(new Date(span.startTs), lang)} → ${formatDayShort(new Date(span.endTs - 1), lang)}`;
  }
  const fmtT = (ts: number): string => {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return `${formatDayShort(new Date(span.startTs), lang)} ${fmtT(span.startTs)} → ${formatDayShort(new Date(span.endTs), lang)} ${fmtT(span.endTs)}`;
}

export function renderWeekView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  anchor: Date,
  onEventClick: (occ: EventOccurrence) => void,
  handlers: TimeGridHandlers = {},
  colors: ColorResolver = createColorResolver(),
  onMoveToDay?: (occ: EventOccurrence, toDay: Date) => void,
  segments: TimeSegment[] = [],
): void {
  container.innerHTML = "";
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byUid = new Map<string, EventOccurrence>();
  for (const occ of occurrences) byUid.set(occ.event.uid, occ);

  // 顶部贯通横条区:全天事件 + 跨天 timed 事件;它们从时间格与窗口计算中剔除,
  // 否则一个跨天事件会把每一天的整列时间格填满,还会把可见窗口撑到 24 小时
  const spanLayout = layoutWeekSpans(occurrences, weekStart);
  const gridOccurrences = occurrences.filter((o) => !spanLayout.consumed.has(o));

  // 统一可见窗口:分区范围 ∪ 整周 timed 事件范围 → 所有列同高,贯通线对齐
  const range = weekWindowRange(segments, gridOccurrences);
  const spanMin = range.endMin - range.startMin;

  const wrap = document.createElement("div");
  wrap.className = "ogenda-week-wrap";

  // 左侧省略刻度标签(06:00 / 12:00 / 18:00)
  const labels = document.createElement("div");
  labels.className = "ogenda-week-timelabels";
  for (const h of TIMELINE_HOURS) {
    const lineMin = h * 60;
    if (lineMin < range.startMin || lineMin > range.endMin) continue;
    const label = document.createElement("div");
    label.className = "ogenda-week-timelabel";
    // 数字在线下方 1 小时处(不与线重叠,阅读更顺)
    label.style.top = `${((lineMin - range.startMin) / 60) * WEEK_HOUR_PX + WEEK_HOUR_PX}px`;
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    labels.appendChild(label);
  }
  wrap.appendChild(labels);

  const main = document.createElement("div");
  main.className = "ogenda-week-main";

  // 列头行(与列宽对齐,移出时间格区域,避免贯通线压到文字)
  const headrow = document.createElement("div");
  headrow.className = "ogenda-week-headrow";
  const weekdayLabels = t("weekday.long").split(",");
  for (let i = 0; i < days.length; i++) {
    const head = document.createElement("div");
    head.className = "ogenda-week-col-head";
    head.textContent = `${weekdayLabels[i]} ${days[i].getDate()}`;
    head.style.color = WEEK_COLORS[i];
    headrow.appendChild(head);
  }
  main.appendChild(headrow);

  // 顶部贯通横条区:独立于时间格区,用 CSS grid 的跨列(grid-column)渲染,
  // 与列头行共用同一套 7 列轨道,横条与列精确对齐;重叠的横条按车道分行。
  if (spanLayout.spans.length) {
    const spanrow = document.createElement("div");
    spanrow.className = "ogenda-week-spanrow";
    for (const span of spanLayout.spans) {
      const bar = document.createElement("div");
      bar.className = "ogenda-week-allday-chip ogenda-week-span";
      if (span.continuesBefore) bar.classList.add("ogenda-week-span-prev");
      if (span.continuesAfter) bar.classList.add("ogenda-week-span-next");
      bar.style.gridColumn = `${span.startCol + 1} / ${span.endCol + 2}`;
      bar.style.gridRow = `${span.lane + 1}`;
      bar.style.borderLeftColor = colors.category(span.occ.event.category);
      // 紧凑标签:只显示标题(时间范围放 tooltip)
      bar.textContent = span.occ.event.title;
      bar.title = spanTooltip(span);
      bar.addEventListener("click", () => onEventClick(span.occ));
      spanrow.appendChild(bar);
    }
    main.appendChild(spanrow);
  }

  const body = document.createElement("div");
  body.className = "ogenda-week-body";
  body.style.height = `${(spanMin / 60) * WEEK_HOUR_PX}px`;

  // 贯通时间线(左到右,事件下方)
  for (const h of TIMELINE_HOURS) {
    const lineMin = h * 60;
    if (lineMin < range.startMin || lineMin > range.endMin) continue;
    const line = document.createElement("div");
    line.className = "ogenda-week-timeline";
    line.style.top = `${((lineMin - range.startMin) / 60) * WEEK_HOUR_PX}px`;
    body.appendChild(line);
  }

  const grid = document.createElement("div");
  grid.className = "ogenda-week-grid";

  for (const day of days) {
    const col = document.createElement("div");
    col.className = "ogenda-week-col";
    col.dataset.day = toDateKey(day);

    if (onMoveToDay) {
      col.addEventListener("dragover", (e) => {
        if (e.dataTransfer?.types.includes(DND_TYPE)) {
          e.preventDefault();
          col.classList.add("ogenda-week-drop");
        }
      });
      col.addEventListener("dragleave", () => col.classList.remove("ogenda-week-drop"));
      col.addEventListener("drop", (e) => {
        col.classList.remove("ogenda-week-drop");
        const uid = e.dataTransfer?.getData(DND_TYPE);
        const occ = uid ? byUid.get(uid) : undefined;
        if (occ) onMoveToDay(occ, day);
      });
    }

    // 时间格(统一窗口;只放单日 timed 事件;全天/跨天事件已在上方横条区;
    // 列内保留整点小时线,贯通线(06/12/18)叠加其上提供全局参考)
    const dayOccs = gridOccurrences.filter((occ) => startOfDay(parseLocalDate(occ.start)).getTime() === day.getTime());
    const timedOccs = dayOccs.filter((occ) => !occ.event.allDay);
    const gridEl = renderTimeGrid(col, day, timedOccs, onEventClick, colors, handlers, {
      hourPx: WEEK_HOUR_PX,
      showGutter: false,
      showNowLine: false,
      segments,
      visibleRange: range,
      blockClass: "ogenda-week-block",
      onBlockCreated: (occ, block) => {
        if (!onMoveToDay) return;
        block.draggable = true;
        block.addEventListener("dragstart", (e) => {
          e.dataTransfer?.setData(DND_TYPE, occ.event.uid);
          e.dataTransfer!.effectAllowed = "move";
          block.classList.add("ogenda-tblock-dragging");
        });
        block.addEventListener("dragend", () => block.classList.remove("ogenda-tblock-dragging"));
      },
    });
    gridEl.classList.add("ogenda-week-tgrid");

    grid.appendChild(col);
  }
  body.appendChild(grid);
  main.appendChild(body);
  wrap.appendChild(main);
  container.appendChild(wrap);
}
