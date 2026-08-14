// 共享时间格渲染:日视图与周视图共用的「24 小时纵向网格」。
// 包含:小时线、时间线分区色块、当前时刻红线、事件块(点击/移动/改时长)、
// 空白区点击与拖拽划范围。分区色块画在事件块下方。
// visibleRange 可选:只渲染窗口内的时段(周视图跟随分区范围,清晨之前不展示);
// 未提供或窗口非法时回退全天 0..1440。
import { EventOccurrence, parseLocalDate } from "../occurrences";
import { ColorResolver } from "../colors";
import { TimeSegment, segmentRects, hexWithAlpha, VisibleRange } from "../time-segments";
import { HOUR_PX, SNAP_MIN, layoutDayGrid, isoToMinutes, snapMinutes } from "../day-grid";
import { startOfDay, toDateKey } from "../date-grid";
import { t } from "../../i18n";

export interface TimeGridHandlers {
  /** 点击空白格(无拖动)→ 在该时刻新建。 */
  onSlotClick?: (day: Date, minutes: number) => void;
  /** 拖拽空白格划出的范围 → 新建。 */
  onRangeCreate?: (day: Date, startMin: number, endMin: number) => void;
  /** 拖动事件卡片 → 整体平移。 */
  onMoveEvent?: (occ: EventOccurrence, deltaMin: number) => void;
  /** 拖动卡片底部 → 调整结束。 */
  onResizeEvent?: (occ: EventOccurrence, deltaMin: number) => void;
}

export interface TimeGridOptions {
  /** 每小时像素高度。 */
  hourPx: number;
  /** 是否渲染左侧小时刻度。 */
  showGutter: boolean;
  /** 当天是否渲染当前时刻红线。 */
  showNowLine: boolean;
  /** 时间线分区(空数组 = 不画)。 */
  segments: TimeSegment[];
  /** 事件块的基础 class(如 "ogenda-day-block" / "ogenda-week-block")。 */
  blockClass: string;
  /** 可见分钟窗口(0..1440);缺省 = 全天。 */
  visibleRange?: VisibleRange;
  /** 是否渲染窗口内的整点小时线(周视图用贯通线替代 → false)。默认 true。 */
  hourLines?: boolean;
  /** 块创建后的额外钩子(周视图挂跨列 DnD)。 */
  onBlockCreated?: (occ: EventOccurrence, block: HTMLElement) => void;
}

/** 规范化窗口:非法/倒置 → 全天。 */
function normRange(r: VisibleRange | undefined): { startMin: number; endMin: number } {
  if (!r) return { startMin: 0, endMin: 1440 };
  const lo = Math.max(0, Math.min(r.startMin, 1440));
  const hi = Math.min(1440, Math.max(r.endMin, lo));
  if (hi - lo < 60) return { startMin: 0, endMin: 1440 }; // 窗口过窄,回退全天
  return { startMin: lo, endMin: hi };
}

/**
 * 把分区窗口向外扩展,容纳窗口外的 timed 事件(深夜有事件时时间轴自动延伸)。
 * 只扩不缩;扩展后仍过窄(< 60 分钟)→ 回退全天,保证事件可见。
 */
function extendRangeWithEvents(
  range: { startMin: number; endMin: number },
  occurrences: EventOccurrence[],
  day: Date,
): { startMin: number; endMin: number } {
  const base = startOfDay(day).getTime();
  const dayEnd = base + 86400_000;
  let lo = range.startMin;
  let hi = range.endMin;
  for (const occ of occurrences) {
    if (occ.event.allDay) continue; // 全天事件走横条,不参与时间轴
    const s = parseLocalDate(occ.start).getTime();
    const e = occ.end ? parseLocalDate(occ.end).getTime() : undefined;
    if (e !== undefined && e <= base) continue; // 完全在昨天
    if (s >= dayEnd) continue; // 完全在明天
    const topMin = Math.round(Math.max(s - base, 0) / 60_000);
    const bottomMin = e === undefined ? topMin + 30 : Math.round(Math.min(e - base, 86400_000) / 60_000);
    lo = Math.min(lo, topMin);
    hi = Math.max(hi, bottomMin);
  }
  lo = Math.max(0, Math.min(lo, 1440));
  hi = Math.min(1440, Math.max(hi, lo));
  if (hi - lo < 60) return { startMin: 0, endMin: 1440 };
  return { startMin: lo, endMin: hi };
}

/** 从 occurrence 反推它所属的「天」(expandOccurrences 已按天裁剪)。 */
function parseOccDay(occ: EventOccurrence): Date {
  const [y, m, d] = occ.start.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 在 container 内渲染一个 24h 时间格,返回网格元素。
 * occurrences 须已按 day 裁剪(expandOccurrences)。
 */
export function renderTimeGrid(
  container: HTMLElement,
  day: Date,
  occurrences: EventOccurrence[],
  onEventClick: (occ: EventOccurrence) => void,
  colors: ColorResolver,
  handlers: TimeGridHandlers,
  opts: TimeGridOptions,
): HTMLElement {
  const { hourPx, blockClass } = opts;
  // 可见窗口 = 分区范围 ∪ 实际事件范围:深夜有事件时时间轴自动扩展显示,
  // 没有则保持分区窗口(清晨之前不占空间)。
  const base = normRange(opts.visibleRange);
  const range = extendRangeWithEvents(base, occurrences, day);
  const layout = layoutDayGrid(occurrences, day, range);
  const dayKey = toDateKey(day);
  const spanMin = range.endMin - range.startMin;

  const grid = document.createElement("div");
  grid.className = "ogenda-timegrid" + (opts.showGutter ? " ogenda-timegrid-guttered" : "");
  grid.style.height = `${(spanMin / 60) * hourPx}px`;

  if (opts.showGutter) {
    const gutter = document.createElement("div");
    gutter.className = "ogenda-timegrid-gutter";
    for (let h = 0; h < 24; h++) {
      const labelMin = h * 60;
      if (labelMin < range.startMin || labelMin > range.endMin) continue;
      const label = document.createElement("div");
      label.className = "ogenda-timegrid-hourlabel";
      label.style.top = `${((labelMin - range.startMin) / 60) * hourPx}px`;
      label.textContent = `${String(h).padStart(2, "0")}:00`;
      gutter.appendChild(label);
    }
    grid.appendChild(gutter);
  }

  // 时间线分区色块(事件下方;窗口裁剪)
  for (const r of segmentRects(opts.segments)) {
    if (r.bottomMin <= range.startMin || r.topMin >= range.endMin) continue;
    const top = Math.max(r.topMin, range.startMin);
    const bottom = Math.min(r.bottomMin, range.endMin);
    const seg = document.createElement("div");
    seg.className = "ogenda-time-segment";
    seg.style.top = `${((top - range.startMin) / 60) * hourPx}px`;
    seg.style.height = `${Math.max(((bottom - top) / 60) * hourPx, 2)}px`;
    seg.style.background = hexWithAlpha(r.color, 0.14);
    seg.title = r.name;
    grid.appendChild(seg);
  }

  // 窗口内的整点小时线(首尾各一条)
  if (opts.hourLines !== false) {
    for (let h = Math.ceil(range.startMin / 60); h <= Math.floor(range.endMin / 60); h++) {
      const lineMin = h * 60;
      if (lineMin <= range.startMin || lineMin >= range.endMin) continue;
      const line = document.createElement("div");
      line.className = "ogenda-timegrid-hourline";
      line.style.top = `${((lineMin - range.startMin) / 60) * hourPx}px`;
      grid.appendChild(line);
    }
  }

  if (opts.showNowLine) {
    const nowKey = toDateKey(new Date());
    if (nowKey === dayKey) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= range.startMin && nowMin <= range.endMin) {
        const nowLine = document.createElement("div");
        nowLine.className = "ogenda-timegrid-nowline";
        nowLine.style.top = `${((nowMin - range.startMin) / 60) * hourPx}px`;
        grid.appendChild(nowLine);
      }
    }
  }

  for (const item of layout.timed) {
    const occ = item.occ;
    const block = document.createElement("div");
    block.className = blockClass;
    block.style.borderLeftColor = colors.category(occ.event.category);
    // 窗口相对坐标:layout 返回绝对分钟,渲染要减去窗口起点(否则与分区色带错位)
    const relTop = item.topMin - range.startMin;
    const relBottom = item.bottomMin - range.startMin;
    block.style.top = `${(relTop / 60) * hourPx}px`;
    block.style.height = `${Math.max(((relBottom - relTop) / 60) * hourPx, 14)}px`;
    block.style.left = `${(item.column / item.columns) * 100}%`;
    block.style.width = `${100 / item.columns}%`;

    // 紧凑标签:只显示标题(时间由时间格位置表达,节约空间)
    const title = document.createElement("div");
    title.className = "ogenda-tblock-title";
    title.textContent = occ.event.title;
    block.appendChild(title);

    const handle = document.createElement("div");
    handle.className = "ogenda-tblock-resize";
    handle.title = t("day.resizeHint");
    block.appendChild(handle);

    let dragged = false;
    block.addEventListener("click", () => {
      if (!dragged) onEventClick(occ);
    });

    attachMoveDrag(block, relTop, relBottom, hourPx, spanMin, occ, handlers, () => (dragged = true));
    attachResizeDrag(handle, hourPx, range, occ, handlers, () => (dragged = true));
    opts.onBlockCreated?.(occ, block);

    grid.appendChild(block);
  }

  attachEmptyDrag(grid, day, hourPx, range, handlers);
  container.appendChild(grid);
  return grid;
}

function attachEmptyDrag(
  grid: HTMLElement,
  day: Date,
  hourPx: number,
  range: { startMin: number; endMin: number },
  handlers: TimeGridHandlers,
): void {
  const rect = () => grid.getBoundingClientRect();
  const toMinutes = (clientY: number): number => {
    const y = clientY - rect().top;
    const raw = range.startMin + Math.round((y / hourPx) * 60);
    return Math.min(Math.max(snapMinutes(raw), range.startMin), range.endMin);
  };

  grid.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const target = e.target as HTMLElement;
    if (target.closest(".ogenda-tblock, .ogenda-day-block, .ogenda-week-block")) return;
    if (target.closest(".ogenda-timegrid-gutter")) return;
    e.preventDefault();
    const startMin = toMinutes(e.clientY);
    let moved = false;
    let ghost: HTMLElement | null = null;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const cur = toMinutes(ev.clientY);
      if (Math.abs(cur - startMin) >= SNAP_MIN / 2) moved = true;
      if (!ghost) {
        ghost = document.createElement("div");
        ghost.className = "ogenda-timegrid-ghost";
        grid.appendChild(ghost);
      }
      const top = Math.min(startMin, cur);
      const bottom = Math.max(startMin, cur);
      ghost.style.top = `${(top / 60) * hourPx}px`;
      ghost.style.height = `${Math.max(((bottom - top) / 60) * hourPx, 4)}px`;
    };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      grid.classList.remove("ogenda-timegrid-dragging");
      if (ghost) ghost.remove();
      if (!moved) {
        handlers.onSlotClick?.(day, startMin);
        return;
      }
      const cur = toMinutes(ev.clientY);
      const top = Math.min(startMin, cur);
      const bottom = Math.max(startMin, cur);
      if (bottom - top >= SNAP_MIN) {
        handlers.onRangeCreate?.(day, top, bottom);
      } else {
        handlers.onSlotClick?.(day, top);
      }
    };

    grid.classList.add("ogenda-timegrid-dragging");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

function attachMoveDrag(
  block: HTMLElement,
  relTop: number,
  relBottom: number,
  hourPx: number,
  spanMin: number,
  occ: EventOccurrence,
  handlers: TimeGridHandlers,
  markDragged: () => void,
): void {
  const resizeHandle = block.querySelector(".ogenda-tblock-resize") as HTMLElement | null;
  block.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (resizeHandle && resizeHandle.contains(e.target as Node)) return; // 交给改时长
    e.preventDefault();
    const startY = e.clientY;
    let moved = false;
    let lastDelta = 0;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const delta = Math.round(((ev.clientY - startY) / hourPx) * 60 / SNAP_MIN) * SNAP_MIN;
      if (delta !== 0) moved = true;
      lastDelta = delta;
      const top = Math.min(Math.max(relTop + delta, 0), spanMin);
      const bottom = Math.min(Math.max(relBottom + delta, top + SNAP_MIN), spanMin);
      block.style.top = `${(top / 60) * hourPx}px`;
      block.style.height = `${((bottom - top) / 60) * hourPx}px`;
      block.classList.add("ogenda-tblock-dragging");
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      block.classList.remove("ogenda-tblock-dragging");
      if (moved) {
        markDragged();
        handlers.onMoveEvent?.(occ, lastDelta);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

function attachResizeDrag(
  handle: HTMLElement,
  hourPx: number,
  range: { startMin: number; endMin: number },
  occ: EventOccurrence,
  handlers: TimeGridHandlers,
  markDragged: () => void,
): void {
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    // 绑定发生在块挂载到 grid 之前,closest 必须在事件触发时再查
    const grid = handle.closest(".ogenda-timegrid") as HTMLElement | null;
    if (!grid) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const spanMin = range.endMin - range.startMin;
    const origBottom = isoToMinutes(occ.end ?? occ.start, parseOccDay(occ)) - range.startMin;
    let moved = false;
    let lastDelta = 0;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const delta = Math.round(((ev.clientY - startY) / hourPx) * 60 / SNAP_MIN) * SNAP_MIN;
      if (delta !== 0) moved = true;
      lastDelta = delta;
      const block = handle.parentElement as HTMLElement;
      const top = Math.min(Math.max(isoToMinutes(occ.start, parseOccDay(occ)) - range.startMin, 0), spanMin);
      const bottom = Math.min(Math.max(origBottom + delta, top + SNAP_MIN), spanMin);
      block.style.top = `${(top / 60) * hourPx}px`;
      block.style.height = `${((bottom - top) / 60) * hourPx}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (moved) {
        markDragged();
        handlers.onResizeEvent?.(occ, lastDelta);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}
