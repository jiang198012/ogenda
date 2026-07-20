import { startOfDay, startOfWeek } from "./date-grid";

export type PanelTab = "list" | "day" | "week" | "month" | "stats";

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
