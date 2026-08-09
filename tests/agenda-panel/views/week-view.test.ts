// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderWeekView } from "../../../src/agenda-panel/views/week-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
import { setLanguage } from "../../../src/i18n";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

beforeEach(() => setLanguage("zh"));

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

  it("colors each weekday header, with weekend distinct from a weekday", () => {
    const container = document.createElement("div");
    renderWeekView(container, [], new Date(2026, 6, 15), () => {});
    const heads = container.querySelectorAll(".ogenda-week-col-head");
    const mon = (heads[0] as HTMLElement).style.color;
    const sat = (heads[5] as HTMLElement).style.color;
    expect(mon).not.toBe("");
    expect(sat).not.toBe("");
    expect(mon).not.toBe(sat);
  });

  it("renders an empty week without throwing and shows 7 empty columns (T5.7)", () => {
    const container = document.createElement("div");
    expect(() => renderWeekView(container, [], new Date(2026, 6, 15), () => {})).not.toThrow();
    expect(container.querySelectorAll(".ogenda-week-col").length).toBe(7);
    expect(container.querySelectorAll(".ogenda-week-card").length).toBe(0);
  });

  it("shows a multi-day all-day event in every day column it spans (T5.9)", () => {
    const container = document.createElement("div");
    const occs = [
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-13" },
      { event: { uid: "a", title: "出差", start: "2026-07-13", end: "2026-07-15", allDay: true, origin: "synced" }, start: "2026-07-14" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const cols = container.querySelectorAll(".ogenda-week-col");
    const cards = [...cols].map((c) => c.querySelectorAll(".ogenda-week-card").length);
    // Mon 13 + Tue 14 each carry the all-day card; Wed 15 is the anchor day (in-week)
    expect(cards[0]).toBe(1);
    expect(cards[1]).toBe(1);
  });

  it("renders a cross-midnight event on the day it spans (T5.8)", () => {
    const container = document.createElement("div");
    // 22:00 Mon Jul 13 → 01:00 Tue Jul 14: expandOccurrences yields an occurrence on Tue
    const occs = [
      { event: { uid: "a", title: "夜班", start: "2026-07-13T22:00:00", end: "2026-07-14T01:00:00", origin: "synced" }, start: "2026-07-13T22:00:00" },
      { event: { uid: "a", title: "夜班", start: "2026-07-13T22:00:00", end: "2026-07-14T01:00:00", origin: "synced" }, start: "2026-07-14T00:00:00" },
    ];
    renderWeekView(container, occs, new Date(2026, 6, 15), () => {});
    const cols = container.querySelectorAll(".ogenda-week-col");
    expect(cols[0].querySelectorAll(".ogenda-week-card").length).toBe(1); // Mon
    expect(cols[1].querySelectorAll(".ogenda-week-card").length).toBe(1); // Tue
  });
});
