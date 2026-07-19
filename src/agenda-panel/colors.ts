import { t } from "../i18n";

export interface StatusStyle {
  label: string;
  text: string;
  bg: string;
}

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  confirmed: { text: "#1e9e4a", bg: "#e3f7e8" },
  tentative: { text: "#b26a00", bg: "#fff2dd" },
  cancelled: { text: "#98a0ad", bg: "#f0f0f2" },
};

const STATUS_LABEL_KEY: Record<string, string> = {
  confirmed: "status.confirmed",
  tentative: "status.tentative",
  cancelled: "status.cancelled",
};

export function statusStyle(raw: string | undefined): StatusStyle {
  const key = (raw ?? "").trim();
  if (key === "") return { label: t("status.unset"), text: "var(--text-muted)", bg: "transparent" };
  if (STATUS_COLORS[key]) return { label: t(STATUS_LABEL_KEY[key]), ...STATUS_COLORS[key] };
  // Unknown non-empty status: keep it visible under its own name, neutral colors.
  return { label: key, text: "var(--text-muted)", bg: "transparent" };
}

export const CATEGORY_PALETTE = [
  "#4c8dff",
  "#ff9500",
  "#06b6d4",
  "#34c759",
  "#a855f7",
  "#ef4444",
  "#ec4899",
  "#eab308",
  "#14b8a6",
  "#6366f1",
];

const NEUTRAL_CATEGORY = "#98a0ad";

/** FNV-1a 32-bit hash → palette index. Deterministic: the same name always maps to the same color. */
function paletteIndex(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % CATEGORY_PALETTE.length;
}

export function categoryColorFor(name: string): string {
  const key = name.trim();
  if (key === "") return NEUTRAL_CATEGORY;
  return CATEGORY_PALETTE[paletteIndex(key)];
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ColorResolver {
  status(raw: string | undefined): StatusStyle;
  category(name: string | undefined): string;
  categoryPillBg(name: string | undefined): string;
}

export function createColorResolver(): ColorResolver {
  return {
    status: (raw) => statusStyle(raw),
    category: (name) => categoryColorFor(name ?? ""),
    categoryPillBg: (name) => hexToRgba(categoryColorFor(name ?? ""), 0.15),
  };
}
