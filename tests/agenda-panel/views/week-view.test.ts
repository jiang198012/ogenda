// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderWeekView } from "../../../src/agenda-panel/views/week-view";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

describe("renderWeekView", () => {
  it("renders 7 day columns, each with its own events", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("2026-07-13T14:00:00", "周一的会"), mkOcc("2026-07-18T09:00:00", "周六的会")];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {}); // anchor = Wed of that week

    const cols = container.querySelectorAll(".ogenda-week-col");
    expect(cols.length).toBe(7);
    expect(container.textContent).toContain("周一的会");
    expect(container.textContent).toContain("周六的会");
  });

  it("puts events in the correct column by day, not just anywhere", () => {
    const container = document.createElement("div");
    renderWeekView(container, [mkOcc("2026-07-18T09:00:00", "周六的会")], new Date(2026, 6, 15), () => {});
    const cols = container.querySelectorAll(".ogenda-week-col");
    // Monday-first: index 0=Mon(13) .. 5=Sat(18) .. 6=Sun(19)
    expect(cols[5].textContent).toContain("周六的会");
    expect(cols[0].textContent).not.toContain("周六的会");
  });

  it("calls onEventClick with the underlying AgendaEvent", () => {
    const container = document.createElement("div");
    const occ = mkOcc("2026-07-13T14:00:00", "周一的会");
    const onClick = vi.fn();
    renderWeekView(container, [occ], new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-week-card") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });
});
