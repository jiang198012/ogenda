// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderWeekView } from "../../../src/agenda-panel/views/week-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";

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

  it("renders a weekday+date header cell for each of the 7 days", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}); // Wed anchor -> week is Mon 13 .. Sun 19
    const heads = container.querySelectorAll(".ogenda-week-col-head");
    expect(heads.length).toBe(7);
    expect(heads[0].textContent).toBe("周一 13");
    expect(heads[5].textContent).toBe("周六 18");
    expect(heads[6].textContent).toBe("周日 19");
  });

  it("puts an all-day event (date-only start) in its own day column, in a timezone west of UTC", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const container = document.createElement("div");
      renderWeekView(container, [mkOcc("2026-07-13", "全天会议")], new Date(2026, 6, 15), () => {});
      const cols = container.querySelectorAll(".ogenda-week-col");
      // Monday-first: index 0=Mon(13)
      expect(cols[0].textContent).toContain("全天会议");
      expect(cols[6].textContent).not.toContain("全天会议");
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("calls onEmptyClick with the day when the empty area of a column is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    renderWeekView(container, [], new Date(2026, 6, 15), () => {}, onEmpty);
    const cols = container.querySelectorAll(".ogenda-week-col");
    (cols[0] as HTMLElement).click();
    expect(onEmpty).toHaveBeenCalledWith(new Date(2026, 6, 13)); // Monday of that week
  });

  it("does NOT call onEmptyClick when a card inside the column is clicked", () => {
    const container = document.createElement("div");
    const onEmpty = vi.fn();
    const onEventClick = vi.fn();
    renderWeekView(container, [mkOcc("2026-07-13T14:00:00", "周一的会")], new Date(2026, 6, 15), onEventClick, onEmpty);
    (container.querySelector(".ogenda-week-card") as HTMLElement).click();
    expect(onEventClick).toHaveBeenCalled();
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it("colors a card's left bar from the event category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "会", start: "2026-07-13T14:00:00", category: "工作", origin: "synced" },
      start: "2026-07-13T14:00:00",
    };
    renderWeekView(container, [occ], new Date(2026, 6, 15), () => {}, undefined, createColorResolver());
    const card = container.querySelector(".ogenda-week-card") as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe("");
  });
});
