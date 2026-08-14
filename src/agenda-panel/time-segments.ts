// 时间线分区(设置里的"时间段填充色"):模型 + 校验 + 纯逻辑换算。
// 每个分区 = 名称 + 起止时间(HH:MM)+ 填充色;渲染时把分区换算成
// 时间格里的纵向矩形(分钟坐标),支持跨午夜(如 22:00–02:00)。
import { t } from "../i18n";

export interface TimeSegment {
  name: string;
  /** "HH:MM"(24 小时制)。 */
  start: string;
  /** "HH:MM";可以小于 start(表示跨午夜,如 22:00 → 02:00)。 */
  end: string;
  /** "#RRGGBB"。 */
  color: string;
  enabled: boolean;
}

/**
 * 色卡:相邻色段色相间隔 ≥50°(旧版黄/橙/橙红三连 + 灰蓝/蓝过近,透明叠加后分不清)。
 * 清晨青(冷)→ 上午蓝 → 中午黄 → 下午玫红 → 傍晚橙 → 晚上紫(冷)。
 */
export const TIME_SEGMENT_COLORS = [
  "#14B8A6", // 清晨:青 teal
  "#3B82F6", // 上午:蓝 blue
  "#EAB308", // 中午:黄 yellow
  "#EC4899", // 下午:玫红 pink
  "#F97316", // 傍晚:橙 orange
  "#8B5CF6", // 晚上:紫 violet
];

/** 默认 6 段(开箱即用,名称随界面语言;06:00–23:00 覆盖,深夜不染色)。 */
export function defaultTimeSegments(): TimeSegment[] {
  return [
    { name: t("segment.early"), start: "06:00", end: "08:30", color: TIME_SEGMENT_COLORS[0], enabled: true },
    { name: t("segment.morning"), start: "08:30", end: "12:00", color: TIME_SEGMENT_COLORS[1], enabled: true },
    { name: t("segment.noon"), start: "12:00", end: "14:00", color: TIME_SEGMENT_COLORS[2], enabled: true },
    { name: t("segment.afternoon"), start: "14:00", end: "17:00", color: TIME_SEGMENT_COLORS[3], enabled: true },
    { name: t("segment.dusk"), start: "17:00", end: "20:00", color: TIME_SEGMENT_COLORS[4], enabled: true },
    { name: t("segment.evening"), start: "20:00", end: "23:00", color: TIME_SEGMENT_COLORS[5], enabled: true },
  ];
}

/** "HH:MM" → 分钟数(0..1439);"24:00" 视为 1440(段末哨兵)。非法返回 null。 */
export function segmentMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59) return null;
  if (h === 24 && mi === 0) return 1440;
  if (h > 23) return null;
  return h * 60 + mi;
}

/** 校验一条分区:名称/时间/颜色。返回错误文案数组(空 = 合法)。 */
export function validateSegment(seg: TimeSegment): string[] {
  const errs: string[] = [];
  if (!seg.name.trim()) errs.push(t("settings.segments.nameRequired"));
  const s = segmentMinutes(seg.start);
  const e = segmentMinutes(seg.end);
  if (s === null || e === null) errs.push(t("settings.segments.timeInvalid"));
  if (s !== null && e !== null && s >= 1440) errs.push(t("settings.segments.timeInvalid"));
  if (!/^#[0-9a-fA-F]{6}$/.test(seg.color)) errs.push(t("settings.segments.colorInvalid"));
  return errs;
}

/** 清理/规整一条分区(从设置文件读入时用);非法字段回落默认。 */
export function sanitizeSegment(raw: unknown, index: number): TimeSegment {
  const r = (raw ?? {}) as Record<string, unknown>;
  const defaults = defaultTimeSegments();
  const fallback = defaults[index % defaults.length];
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const color = str(r.color, fallback.color);
  return {
    name: str(r.name, fallback.name),
    start: /^(\d{1,2}):\d{2}$/.test(str(r.start, fallback.start)) ? str(r.start, fallback.start) : fallback.start,
    end: /^(\d{1,2}):\d{2}$/.test(str(r.end, fallback.end)) ? str(r.end, fallback.end) : fallback.end,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback.color,
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
  };
}

export interface SegmentRect {
  /** 距当天 0 点的开始分钟(0..1440)。 */
  topMin: number;
  /** 结束分钟(0..1440,大于 topMin)。 */
  bottomMin: number;
  color: string;
  name: string;
}

export interface VisibleRange {
  startMin: number;
  endMin: number;
}

/**
 * 周视图时间格的可见范围:从最早启用分区的开始,到最晚启用分区的结束。
 * - 没有任何启用分区 → 全天 0..1440(回退,不裁剪);
 * - 存在跨午夜段(22:00→02:00)或解析失败 → 全天(裁剪会破坏跨午夜显示);
 * - 空返回 { startMin: 1440, endMin: 0 } 之外不成立,恒为合法区间。
 */
export function visibleRange(segments: TimeSegment[]): VisibleRange {
  const enabled = segments.filter((s) => s.enabled);
  if (!enabled.length) return { startMin: 0, endMin: 1440 };
  let startMin = 1440;
  let endMin = 0;
  let midnightCross = false;
  for (const s of enabled) {
    const st = segmentMinutes(s.start);
    const en = segmentMinutes(s.end);
    if (st === null || en === null) continue;
    if (st > en) midnightCross = true;
    startMin = Math.min(startMin, st);
    endMin = Math.max(endMin, en);
  }
  if (midnightCross || startMin === 1440) return { startMin: 0, endMin: 1440 };
  return { startMin, endMin: Math.min(endMin, 1440) };
}

/**
 * 把启用的分区换算成时间格矩形。
 * - 按 start 排序;
 * - 跨午夜段(22:00 → 02:00)拆成两段:22:00–24:00 和 00:00–02:00;
 * - 重叠段后者覆盖(渲染顺序即覆盖顺序);
 * - 全关/空 → []。
 */
export function segmentRects(segments: TimeSegment[]): SegmentRect[] {
  const out: SegmentRect[] = [];
  const valid = segments.filter((s) => s.enabled).map((s) => ({ s, start: segmentMinutes(s.start), end: segmentMinutes(s.end) }));
  valid.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  for (const { s, start, end } of valid) {
    if (start === null || end === null) continue;
    if (start > end) {
      // 跨午夜
      out.push({ topMin: start, bottomMin: 1440, color: s.color, name: s.name });
      out.push({ topMin: 0, bottomMin: Math.min(end, 1440), color: s.color, name: s.name });
    } else if (end > start) {
      out.push({ topMin: start, bottomMin: Math.min(end, 1440), color: s.color, name: s.name });
    }
  }
  return out;
}

/** 渲染用:hex 颜色 + alpha → rgba()。 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
