// 日视图:全天事件横条 + 共享 24h 时间格(renderTimeGrid)。
// 交互:点空白格 → 在该小时新建;拖拽空白格 → 划范围新建;
// 拖事件卡片 → 移动;拖卡片底部把手 → 调整结束时间。鼠标拖拽,触屏走点击。
// 可见范围跟随分区:没有设置分区的时段(如清晨之前)默认不展示;无分区时回退全天。
import { EventOccurrence } from "../occurrences";
import { ColorResolver, createColorResolver } from "../colors";
import { TimeSegment, visibleRange } from "../time-segments";
import { HOUR_PX, layoutDayGrid } from "../day-grid";
import { startOfDay } from "../date-grid";
import { renderTimeGrid, TimeGridHandlers } from "./time-grid";
import { t } from "../../i18n";

export type { TimeGridHandlers };

export function renderDayView(
  container: HTMLElement,
  occurrences: EventOccurrence[],
  onEventClick: (occ: EventOccurrence) => void,
  colors: ColorResolver = createColorResolver(),
  handlers: TimeGridHandlers = {},
  anchorDay: Date = new Date(),
  segments: TimeSegment[] = [],
): void {
  container.innerHTML = "";
  const day = startOfDay(anchorDay);
  const layout = layoutDayGrid(occurrences, day);

  const wrap = document.createElement("div");
  wrap.className = "ogenda-day-grid-wrap";

  if (layout.allDay.length) {
    const strip = document.createElement("div");
    strip.className = "ogenda-day-allday";
    for (const occ of layout.allDay) {
      const chip = document.createElement("div");
      chip.className = "ogenda-day-allday-chip";
      chip.style.borderLeftColor = colors.category(occ.event.category);
      // 紧凑标签:只显示标题
      chip.textContent = occ.event.title;
      chip.title = t("view.allDay");
      chip.addEventListener("click", () => onEventClick(occ));
      strip.appendChild(chip);
    }
    wrap.appendChild(strip);
  }

  renderTimeGrid(wrap, day, occurrences, onEventClick, colors, handlers, {
    hourPx: HOUR_PX,
    showGutter: true,
    showNowLine: true,
    segments,
    visibleRange: visibleRange(segments),
    blockClass: "ogenda-day-block",
  });

  container.appendChild(wrap);
}
