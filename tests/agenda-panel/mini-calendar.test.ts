// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderMiniCalendar, monthsToFill, daysWithEvents } from "../../src/agenda-panel/mini-calendar";
import { setLanguage } from "../../src/i18n";
beforeEach(() => setLanguage("zh"));

describe("renderMiniCalendar", () => {
  it("renders a 7x5 grid for July 2026", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {});
    expect(container.querySelectorAll(".ogenda-mini-cal-cell").length).toBe(35);
  });

  it("marks padding days from adjacent months", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-mini-cal-cell");
    expect(cells[0].classList.contains("ogenda-mini-cal-othermonth")).toBe(true); // June 29
    expect(cells[2].classList.contains("ogenda-mini-cal-othermonth")).toBe(false); // July 1
  });

  it("marks the anchor date as selected", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 18), () => {});
    const cells = [...container.querySelectorAll(".ogenda-mini-cal-cell")];
    const selected = cells.find((c) => c.classList.contains("ogenda-mini-cal-selected"));
    expect(selected?.textContent).toBe("18");
  });

  it("calls onDayClick with the clicked date", () => {
    const container = document.createElement("div");
    const onClick = vi.fn();
    renderMiniCalendar(container, new Date(2026, 6, 15), onClick);
    const cells = [...container.querySelectorAll(".ogenda-mini-cal-cell")];
    const day1 = cells.find((c) => c.textContent === "1" && !c.classList.contains("ogenda-mini-cal-othermonth"));
    (day1 as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(new Date(2026, 6, 1));
  });

  it("monthsToFill: falls back to 3 when height is unknown, else fills by per-month height", () => {
    expect(monthsToFill(0)).toBe(3);
    expect(monthsToFill(-10)).toBe(3);
    expect(monthsToFill(720, 240)).toBe(3);
    expect(monthsToFill(500, 240)).toBe(2);
    expect(monthsToFill(100, 240)).toBe(1);
  });

  it("daysWithEvents: collects the date keys that carry events", () => {
    const set = daysWithEvents([
      { event: { uid: "a", title: "x", start: "2026-07-06T09:00:00", origin: "synced" }, start: "2026-07-06T09:00:00" },
      { event: { uid: "b", title: "y", start: "2026-07-20", origin: "synced" }, start: "2026-07-20" },
    ]);
    expect(set.has("2026-07-06")).toBe(true);
    expect(set.has("2026-07-20")).toBe(true);
    expect(set.has("2026-07-07")).toBe(false);
  });

  it("renders monthCount month blocks stacked vertically", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 3 });
    expect(container.querySelectorAll(".ogenda-mini-cal-month").length).toBe(3);
  });

  it("marks a dot on days that have events", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { eventDays: new Set(["2026-07-06"]) });
    expect(container.querySelectorAll(".ogenda-mini-cal-dot").length).toBe(1);
  });

  it("does not double-dot a day that is real in one month block but padding in an adjacent one", () => {
    const container = document.createElement("div");
    // With the 1-month back-shift, monthCount:3 anchored in July shows Jun/Jul/Aug.
    // 2026-07-29 is a real cell in the July block and a padding cell in the August block
    // (the Aug grid starts Mon 2026-07-27). It must be dotted exactly once — in its own month.
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, {
      monthCount: 3,
      eventDays: new Set(["2026-07-29"]),
    });
    expect(container.querySelectorAll(".ogenda-mini-cal-dot").length).toBe(1);
  });

  it("shifts back one month for 2+ months: first block is the previous month", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 2 });
    const headers = container.querySelectorAll(".ogenda-mini-cal-header");
    expect(headers[0].textContent).toBe("2026年6月");
    expect(headers[1].textContent).toBe("2026年7月");
  });

  it("keeps the current month (no shift) when only one month fits", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 15), () => {}, { monthCount: 1 });
    const headers = container.querySelectorAll(".ogenda-mini-cal-header");
    expect(headers[0].textContent).toBe("2026年7月");
  });

  it("highlights the anchor day in the current-month block, not the first block", () => {
    const container = document.createElement("div");
    renderMiniCalendar(container, new Date(2026, 6, 18), () => {}, { monthCount: 2 });
    const months = container.querySelectorAll(".ogenda-mini-cal-month");
    expect(months[0].querySelector(".ogenda-mini-cal-selected")).toBeNull();
    expect(months[1].querySelector(".ogenda-mini-cal-selected")?.textContent).toBe("18");
  });
});
