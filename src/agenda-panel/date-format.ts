import { Lang } from "../i18n";

const WEEKDAYS_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Spec date format b, e.g. zh "2026年7月19日 星期日" / en "Sun, Jul 19, 2026". */
export function formatDate(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_ZH[d.getDay()]}`;
  }
  return `${WEEKDAYS_EN[d.getDay()]}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** e.g. zh "2026年7月" / en "Jul 2026". */
export function formatMonth(d: Date, lang: Lang): string {
  if (lang === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}

const WEEKDAYS_SHORT_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** List-row date, no year. zh "7月20日 周一" / en "Mon, Jul 20". */
export function formatDayShort(d: Date, lang: Lang): string {
  if (lang === "zh") {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_SHORT_ZH[d.getDay()]}`;
  }
  return `${WEEKDAYS_EN[d.getDay()]}, ${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
}

/** ISO 8601 week number + ISO week-year (year may differ from calendar year at boundaries). */
function isoWeekParts(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (t.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
  const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
  return { year: isoYear, week };
}

/** zh "2026年第29周" / en "Week 29, 2026". */
export function formatWeek(d: Date, lang: Lang): string {
  const { year, week } = isoWeekParts(d);
  if (lang === "zh") return `${year}年第${week}周`;
  return `Week ${week}, ${year}`;
}
