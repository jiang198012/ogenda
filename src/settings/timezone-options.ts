interface CuratedZone {
  iana: string;
  cityZh: string;
  cityEn: string;
}

// 每个条目对应一个有代表性的城市,覆盖全球主要时区偏移量(整点为主,不含如尼泊尔 +5:45
// 这类极少见的 15 分钟偏移——这轮只做"有代表性",不追求穷举全部约 400 个 IANA 时区名)。
const CURATED_ZONES: CuratedZone[] = [
  { iana: "Pacific/Honolulu", cityZh: "檀香山", cityEn: "Honolulu" },
  { iana: "America/Anchorage", cityZh: "安克雷奇", cityEn: "Anchorage" },
  { iana: "America/Los_Angeles", cityZh: "洛杉矶", cityEn: "Los Angeles" },
  { iana: "America/Denver", cityZh: "丹佛", cityEn: "Denver" },
  { iana: "America/Chicago", cityZh: "芝加哥", cityEn: "Chicago" },
  { iana: "America/New_York", cityZh: "纽约", cityEn: "New York" },
  { iana: "America/Halifax", cityZh: "哈利法克斯", cityEn: "Halifax" },
  { iana: "America/Sao_Paulo", cityZh: "圣保罗", cityEn: "Sao Paulo" },
  { iana: "Atlantic/Azores", cityZh: "亚速尔", cityEn: "Azores" },
  { iana: "Europe/London", cityZh: "伦敦", cityEn: "London" },
  { iana: "Europe/Paris", cityZh: "巴黎", cityEn: "Paris" },
  { iana: "Europe/Athens", cityZh: "雅典", cityEn: "Athens" },
  { iana: "Europe/Moscow", cityZh: "莫斯科", cityEn: "Moscow" },
  { iana: "Asia/Dubai", cityZh: "迪拜", cityEn: "Dubai" },
  { iana: "Asia/Karachi", cityZh: "卡拉奇", cityEn: "Karachi" },
  { iana: "Asia/Kolkata", cityZh: "新德里", cityEn: "New Delhi" },
  { iana: "Asia/Dhaka", cityZh: "达卡", cityEn: "Dhaka" },
  { iana: "Asia/Bangkok", cityZh: "曼谷", cityEn: "Bangkok" },
  { iana: "Asia/Shanghai", cityZh: "北京", cityEn: "Beijing" },
  { iana: "Asia/Tokyo", cityZh: "东京", cityEn: "Tokyo" },
  { iana: "Australia/Adelaide", cityZh: "阿德莱德", cityEn: "Adelaide" },
  { iana: "Australia/Sydney", cityZh: "悉尼", cityEn: "Sydney" },
  { iana: "Pacific/Auckland", cityZh: "奥克兰", cityEn: "Auckland" },
];

function offsetMinutes(iana: string, now: Date): number {
  const partsFor = (tz: string): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  };
  return (partsFor(iana) - partsFor("UTC")) / 60000;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export interface TimezoneOption {
  iana: string;
  cityZh: string;
  cityEn: string;
  label: string;
}

export function buildTimezoneOptions(now: Date = new Date()): TimezoneOption[] {
  return CURATED_ZONES.map((z) => ({
    iana: z.iana,
    cityZh: z.cityZh,
    cityEn: z.cityEn,
    label: `${formatOffset(offsetMinutes(z.iana, now))}(${z.cityZh})`,
  }));
}
