import { zh } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";

const TABLES: Record<Lang, Record<string, string>> = { zh, en };

let currentLang: Lang = "en";

export function setLanguage(lang: Lang): void {
  currentLang = lang;
}

export function getLanguage(): Lang {
  return currentLang;
}

/** "auto" follows Obsidian's UI locale (zh* → zh, everything else → en). */
export function resolveLanguage(setting: "auto" | Lang, obsidianLocale: string): Lang {
  if (setting === "zh" || setting === "en") return setting;
  return obsidianLocale.startsWith("zh") ? "zh" : "en";
}

/** Look up current lang, fall back to en, then to the key itself; interpolate {params}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = TABLES[currentLang][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, p) => (p in params ? String(params[p]) : `{${p}}`));
}
