import { startOfDay, startOfWeek, addDays } from "./date-grid";

export type PanelTab = "list" | "day" | "week" | "month" | "stats";

/**
 * Move the anchor one time-unit for the given tab, matching isAtToday's
 * granularity: day/list → 1 day; week → 7 days; month/stats → 1 calendar month
 * (clamped to the target month's last day, so Jan 31 → Feb 28).
 */
export function shiftAnchorFor(tab: PanelTab, anchor: Date, dir: 1 | -1): Date {
  if (tab === "day" || tab === "list") return addDays(anchor, dir);
  if (tab === "week") return addDays(anchor, dir * 7);
  const targetMonth = anchor.getMonth() + dir;
  const daysInTarget = new Date(anchor.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(anchor.getFullYear(), targetMonth, Math.min(anchor.getDate(), daysInTarget));
}

/**
 * Whether the anchor falls within today's time-unit for the given tab:
 * day/list → same calendar day; week → same Monday-start week; month/stats → same calendar month.
 * Used to decide whether to show the "jump to today" nav button (hidden when already at today).
 */
export function isAtToday(tab: PanelTab, anchor: Date, today: Date): boolean {
  if (tab === "week") return startOfWeek(anchor).getTime() === startOfWeek(today).getTime();
  if (tab === "month" || tab === "stats")
    return anchor.getFullYear() === today.getFullYear() && anchor.getMonth() === today.getMonth();
  return startOfDay(anchor).getTime() === startOfDay(today).getTime();
}
