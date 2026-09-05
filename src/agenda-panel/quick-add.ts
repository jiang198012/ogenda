// 自然语言快速创建解析器:从一句话里抽出「日期 + 时间(+ 时长)+ 标题」。
// 纯函数,不依赖 Obsidian,便于单测。
//
// 支持的写法(中文为主,常用英文兜底):
//  日期:今天 / 明天 / 后天 / 大后天 / 周五 / 下周一 / 7-25 / 2026-07-25 /
//        today / tomorrow / the day after tomorrow / next monday / monday
//  时间:15:00 / 3pm / 下午3点 / 下午三点半 / 早上9点 / 中午12点 / 晚上8点 / 9点半 / 8点45
//  时长(可选):1小时 / 30分钟 / 1.5小时 / 2h / 90min(缺省默认 1 小时)
//  标题:去掉日期时间后剩下的文字
//
// 无时段前缀的裸时间:按字面小时处理(9点 → 09:00,15点 → 15:00);
// 带 下午/晚上 前缀且小时 < 12 时加 12(下午3点 → 15:00);
// 早上/上午 不变;中午固定 12 点。

export interface QuickAddSuccess {
  ok: true;
  title: string;
  start: string; // ISO datetime "YYYY-MM-DDTHH:MM:00"(本地时间)
  end: string; // 同一时刻 ISO
  allDay: false;
}

export interface QuickAddFailure {
  ok: false;
  reason: string; // i18n key
}

export type QuickAddResult = QuickAddSuccess | QuickAddFailure;

const WEEKDAY_ZH: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 天: 7, 日: 7,
};
const WEEKDAY_EN: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6, sun: 7, sunday: 7,
};

/** "2026-07-25" / "2026-07-25T09:00:00" → Date(本地时间)。解析失败返回 null。 */
function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isValidCalendarDate(d, Number(m[1]), Number(m[2]), Number(m[3])) ? d : null;
}

function isValidCalendarDate(d: Date, year: number, month: number, day: number): boolean {
  return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Date → "YYYY-MM-DD"(本地)。 */
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "YYYY-MM-DD" + 分钟数(0..1439)→ ISO datetime。 */
function isoAt(dateStr: string, minutes: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${dateStr}T${p(hh)}:${p(mm)}:00`;
}

/** Date → "YYYY-MM-DDTHH:MM:00"(本地)。 */
function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/** 日期表达式 → "YYYY-MM-DD";无法识别返回 null。 */
export function parseQuickAddDate(token: string, anchor: Date): string | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;

  // 今天 / 明天 / 后天 / 大后天
  if (t === "今天" || t === "今日" || t === "today") return fmtDate(anchor);
  if (t === "明天" || t === "明日" || t === "tomorrow" || t === "tmr") {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 1);
    return fmtDate(d);
  }
  if (t === "后天" || t === "the day after tomorrow") {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 2);
    return fmtDate(d);
  }
  if (t === "大后天") {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 3);
    return fmtDate(d);
  }
  // 昨天
  if (t === "昨天" || t === "昨日" || t === "yesterday") {
    const d = new Date(anchor);
    d.setDate(d.getDate() - 1);
    return fmtDate(d);
  }

  // 周X / 星期X / 礼拜X / 下周五(本自然周内;已过则顺延一周;「下」强制下周)
  const zhDow = /^(下)?(?:周|星期|礼拜)([一二三四五六天日])$/.exec(t);
  if (zhDow) {
    const want = WEEKDAY_ZH[zhDow[2]];
    return weekdayOnOrAfter(anchor, want, Boolean(zhDow[1]));
  }

  // next monday / monday(本周内,已过顺延)
  const enDow = /^(next\s+)?(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)$/.exec(t);
  if (enDow) {
    const want = WEEKDAY_EN[enDow[2]];
    return weekdayOnOrAfter(anchor, want, Boolean(enDow[1]));
  }

  // 2026-07-25 / 7-25 / 2026/7/25 / 7/25
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (iso) {
    const d = parseIsoDate(`${iso[1]}-${iso[2]}-${iso[3]}`);
    return d ? fmtDate(d) : null;
  }
  const md = /^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (md) {
    const year = md[1] ? Number(md[1]) : anchor.getFullYear();
    const month = Number(md[2]);
    const day = Number(md[3]);
    const d = new Date(year, month - 1, day);
    if (!isValidCalendarDate(d, year, month, day)) return null;
    return fmtDate(d);
  }

  // 2026年9月6日 / 2026年9月6日(中文输入常紧接时间)
  const cn = /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(t);
  if (cn) {
    const year = Number(cn[1]);
    const month = Number(cn[2]);
    const day = Number(cn[3]);
    const d = new Date(year, month - 1, day);
    return isValidCalendarDate(d, year, month, day) ? fmtDate(d) : null;
  }

  return null;
}

/** 找 anchor 所在周(周一起)里序号为 want(1=周一..7=周日)的那天;已过则顺延一周。 */
function weekdayOnOrAfter(anchor: Date, want: number, forceNextWeek: boolean): string {
  const dow = (anchor.getDay() + 6) % 7 + 1; // 周一=1..周日=7
  let delta = want - dow;
  if (delta < 0 || (delta === 0 && forceNextWeek)) delta += 7;
  const d = new Date(anchor);
  d.setDate(d.getDate() + delta);
  return fmtDate(d);
}

const PERIOD_AM = "am";
const PERIOD_PM = "pm";
const PERIOD_NOON = "noon";

export interface ParsedTime {
  minutes: number; // 0..1439
  /** 匹配到的时间文本(用于从输入里剔除)。 */
  raw: string;
}

const TIME_PATTERNS: { re: RegExp; period?: string }[] = [
  // 15:00 / 15:00:00(24 小时制,优先)
  { re: /([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?/ },
  // 下午3点45分 / 晚上8点半 / 早上9点 / 中午12点
  { re: /(下午|晚上|早上|上午|中午|清晨|凌晨)?(?:([0-9一二三四五六七八九两]|1[0-9]|2[0-3])\s*点)\s*(半|([0-5]?[0-9一二三四五六七八九])\s*分?)?/ },
  // 3pm / 3:30pm / 3:30 p.m.
  { re: /([0-9]{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)/ },
];

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/**
 * 从文本里找第一个时间表达式。返回解析出的分钟数 + 匹配文本;
 * 找不到返回 null。14:23 类的 24 小时制直接换算;下午/晚上前缀在小时 < 12 时 +12。
 */
export function parseQuickAddTime(input: string): ParsedTime | null {
  const s = input.trim();
  for (const { re } of TIME_PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    if (re.source.startsWith("([01]\\d|2[0-3])")) {
      // 24h HH:MM
      return { minutes: Number(m[1]) * 60 + Number(m[2]), raw: m[0] };
    }
    if (re.source.startsWith("(下午|晚上|早上")) {
      const period = m[1];
      let hour = toCnHour(m[2]);
      const half = m[3] === "半";
      const minute = half ? 30 : m[4] ? toCnMinute(m[4]) : 0;
      if (period === "中午") hour = 12;
      else if ((period === "下午" || period === "晚上" || period === "凌晨") && hour < 12) hour += 12;
      else if (period === "清晨") hour = Math.min(hour, 6);
      if (hour > 23 || minute > 59) continue; // 非法时间,继续尝试下一个模式
      return { minutes: hour * 60 + minute, raw: m[0] };
    }
    // am/pm 制
    const hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const isPm = /pm|p\.m\./i.test(m[3]);
    let h = hour % 12;
    if (isPm) h += 12;
    return { minutes: h * 60 + minute, raw: m[0] };
  }
  return null;
}

function toCnHour(s: string): number {
  if (/^\d/.test(s)) return Number(s);
  return CN_NUM[s] ?? NaN;
}

function toCnMinute(s: string): number {
  if (/^\d/.test(s)) return Number(s);
  // 十几 / 二十几 之类不做,只支持个位数中文
  if (CN_NUM[s] !== undefined) return CN_NUM[s];
  if (s.length === 2 && CN_NUM[s[0]] !== undefined && CN_NUM[s[1]] !== undefined) {
    return CN_NUM[s[0]] * 10 + CN_NUM[s[1]];
  }
  return NaN;
}

/** 时长表达式 → 分钟数;找不到返回 null(调用方按缺省处理)。 */
export function parseQuickAddDuration(input: string): { minutes: number; raw: string } | null {
  // 1小时 / 1个半小时 / 30分钟 / 1.5小时 / 2h / 90min / 半小时
  const zh = /(?:(\d+(?:\.\d+)?|半)\s*个?\s*(?:小?时|钟头))|(?:(\d+)\s*分钟)/.exec(input);
  if (zh) {
    if (zh[2] !== undefined) return { minutes: Number(zh[2]), raw: zh[0] };
    const v = zh[1] === "半" ? 0.5 : Number(zh[1]);
    return { minutes: Math.round(v * 60), raw: zh[0] };
  }
  const en = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|min|mins|minute|minutes)\b/.exec(input);
  if (en) {
    const unit = en[2].toLowerCase();
    const base = Number(en[1]);
    const minutes = unit.startsWith("min") ? Math.round(base) : Math.round(base * 60);
    return { minutes, raw: en[0] };
  }
  return null;
}

const DEFAULT_DURATION_MIN = 60;

/**
 * 解析一句话 → 事件草稿。anchor 为「今天」的基准日期(本地时间)。
 * 标题里允许同时带日期/时间/时长词(比如「周五 10:00 周会 1小时」),
 * 解析顺序:先取日期、再取时间、再取时长,其余文本(剔除这些词)作为标题。
 */
export function parseQuickAdd(input: string, anchor: Date): QuickAddResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "quickadd.empty" };

  // 先整体找日期:取输入里第一个可识别的日期词;同时排除标题里可能出现的歧义
  const dateMatch = findFirstDateToken(text, anchor);
  let title = text;
  let dateStr: string | null = null;
  if (dateMatch) {
    dateStr = dateMatch.date;
    title = title.replace(dateMatch.raw, " ").replace(/\s+/g, " ").trim();
  }

  const timeMatch = parseQuickAddTime(title);
  let minutes = 9 * 60; // 没提到时间时默认 09:00
  if (timeMatch) {
    minutes = timeMatch.minutes;
    title = title.replace(timeMatch.raw, " ").replace(/\s+/g, " ").trim();
  }

  const durMatch = parseQuickAddDuration(title);
  let duration = DEFAULT_DURATION_MIN;
  if (durMatch) {
    duration = durMatch.minutes;
    title = title.replace(durMatch.raw, " ").replace(/\s+/g, " ").trim();
  }

  if (!title) return { ok: false, reason: "quickadd.noTitle" };

  const startDate = dateStr ?? fmtDate(anchor);
  const start = isoAt(startDate, minutes);
  const end = addMinutesAcrossDay(start, duration);
  return { ok: true, title, start, end, allDay: false };
}

/** start + duration 分钟,正确处理跨午夜进位(结束日期可能到次日)。 */
function addMinutesAcrossDay(startIso: string, minutes: number): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{2}):(\d{2})/.exec(startIso);
  if (!m) return startIso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  d.setMinutes(d.getMinutes() + minutes);
  return fmtDateTime(d);
}

interface DateToken {
  raw: string;
  date: string;
}

/** 按优先级扫描整句,返回第一个能识别的日期词(避免「周五」出现在标题里被误判)。 */
function findFirstDateToken(text: string, anchor: Date): DateToken | null {
  // 中文显式日期需先于其它数字词剔除,否则后续时间解析会把日期留在标题中。
  const cn = /(?:^|[^\d])(\d{4}年\d{1,2}月\d{1,2}日?)/.exec(text);
  if (cn) {
    const d = parseQuickAddDate(cn[1], anchor);
    if (d) return { raw: cn[1], date: d };
  }
  // 显式日期(2026-07-25 / 7-25)优先
  const iso = /(?:^|[^\d])((\d{4})[-/](\d{1,2})[-/](\d{1,2}))(?!\d)/.exec(text);
  if (iso) {
    const d = parseIsoDate(`${iso[2]}-${iso[3]}-${iso[4]}`);
    if (d) return { raw: iso[1], date: fmtDate(d) };
  }
  const md = /(?:^|[^\d])((\d{1,2})[-/](\d{1,2}))(?!\d)/.exec(text);
  if (md) {
    const d = new Date(anchor.getFullYear(), Number(md[2]) - 1, Number(md[3]));
    if (!isNaN(d.getTime())) return { raw: md[1], date: fmtDate(d) };
  }
  // 相对词(今天/明天/后天/大后天/昨天)
  const rel =
    /(今天|今日|明天|明日|后天|大后天|昨天|昨日|today|tomorrow|tmr|yesterday|the day after tomorrow)/i.exec(text);
  if (rel) {
    const d = parseQuickAddDate(rel[1], anchor);
    if (d) return { raw: rel[1], date: d };
  }
  // 下周五 / 周五 / 下周一 / next monday / monday
  const dow =
    /((?:下)?(?:周|星期|礼拜)[一二三四五六天日])|(next\s+(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday))|((?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b)/i.exec(
      text,
    );
  if (dow) {
    const raw = dow[0];
    const d = parseQuickAddDate(raw, anchor);
    if (d) return { raw, date: d };
  }
  return null;
}
