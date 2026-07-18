// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderMiniCalendar } from "../../src/agenda-panel/mini-calendar";

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
});
