// 重复规则(功能2):预设 ↔ RRULE 字符串的转换与校验。纯函数,不依赖 Obsidian。
import ICAL from "ical.js";

export type RrulePreset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";

export const RRULE_PRESETS: { value: RrulePreset; labelKey: string }[] = [
  { value: "none", labelKey: "rrule.none" },
  { value: "daily", labelKey: "rrule.daily" },
  { value: "weekdays", labelKey: "rrule.weekdays" },
  { value: "weekly", labelKey: "rrule.weekly" },
  { value: "monthly", labelKey: "rrule.monthly" },
  { value: "yearly", labelKey: "rrule.yearly" },
  { value: "custom", labelKey: "rrule.custom" },
];

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** "2026-07-14T09:00:00" / "2026-07-14" → "MO".."SU";无法解析返回 null。 */
export function weekdayForIso(iso: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

/** 已有 RRULE → 对应预设;无法归入任一预设时返回 custom。 */
export function presetForRrule(rrule: string | undefined): RrulePreset {
  const r = (rrule ?? "").trim().toUpperCase();
  if (!r) return "none";
  if (/^FREQ=DAILY$/.test(r)) return "daily";
  if (/^FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR$/.test(r)) return "weekdays";
  if (/^FREQ=WEEKLY(;INTERVAL=\d+)?;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.test(r)) return "weekly";
  if (/^FREQ=MONTHLY$/.test(r)) return "monthly";
  if (/^FREQ=YEARLY$/.test(r)) return "yearly";
  return "custom";
}

/**
 * 预设 + 起始时间 → RRULE 字符串(undefined = 不重复)。
 * weekly 按 startIso 的星期几补 BYDAY;custom 原样返回(由调用方校验)。
 */
export function buildRrule(preset: RrulePreset, startIso: string, rawCustom: string): string | undefined {
  switch (preset) {
    case "none":
      return undefined;
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly": {
      const day = weekdayForIso(startIso);
      return day ? `FREQ=WEEKLY;BYDAY=${day}` : "FREQ=WEEKLY";
    }
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
    case "custom": {
      const raw = rawCustom.trim();
      return raw || undefined;
    }
  }
}

/** RRULE 字符串是否可被 ical.js 解析且带有效 FREQ。 */
export function isValidRrule(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  try {
    const r = ICAL.Recur.fromString(s);
    return r.freq !== null && r.freq !== undefined;
  } catch {
    return false;
  }
}
