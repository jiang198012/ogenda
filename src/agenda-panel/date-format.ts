const WEEKDAYS_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/** Spec date format b, e.g. "2026年7月19日 星期日". */
export function formatChineseDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS_ZH[d.getDay()]}`;
}

/** e.g. "2026年7月". */
export function formatChineseMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
