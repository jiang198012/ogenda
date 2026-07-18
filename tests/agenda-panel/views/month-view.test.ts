// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderMonthView } from "../../../src/agenda-panel/views/month-view";

const mkOcc = (start: string, title: string): EventOccurrence => ({
  event: { uid: title, title, start, origin: "synced" },
  start,
});

describe("renderMonthView", () => {
  it("renders a 7x5 grid for July 2026 with day numbers, including padding days", () => {
    const container = document.createElement("div");
    renderMonthView(container, [], new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    expect(cells.length).toBe(35); // 5 weeks
    expect(cells[2].textContent).toContain("1"); // Wed = July 1
  });

  it("marks padding days from adjacent months with a distinct class", () => {
    const container = document.createElement("div");
    renderMonthView(container, [], new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    expect(cells[0].classList.contains("ogenda-month-othermonth")).toBe(true); // June 29
    expect(cells[2].classList.contains("ogenda-month-othermonth")).toBe(false); // July 1
  });

  it("renders one mini-title element per event on a day, not folded/truncated", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("2026-07-06T09:00:00", "早会"), mkOcc("2026-07-06T14:00:00", "晚会")];
    renderMonthView(container, occs, new Date(2026, 6, 15), () => {});
    const cells = container.querySelectorAll(".ogenda-month-cell");
    const july6 = cells[9]; // Mon 6/29 is index 0 -> July 6 is the 8th day -> index 8... see note below
    // July 6, 2026 is a Monday, the first Monday fully inside July -> row 1 (0-indexed), col 0 -> index 7
    const minis = container.querySelectorAll(".ogenda-month-mini");
    expect(minis.length).toBe(2);
    expect([...minis].map((m) => m.textContent)).toEqual(["早会", "晚会"]);
  });

  it("calls onEventClick with the underlying AgendaEvent", () => {
    const container = document.createElement("div");
    const occ = mkOcc("2026-07-06T09:00:00", "早会");
    const onClick = vi.fn();
    renderMonthView(container, [occ], new Date(2026, 6, 15), onClick);
    (container.querySelector(".ogenda-month-mini") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });

  it("renders a fixed 7-cell weekday header row (Mon-first)", () => {
    const container = document.createElement("div");
    renderMonthView(container, [], new Date(2026, 6, 15), () => {});
    const dow = container.querySelectorAll(".ogenda-month-dow");
    expect(dow.length).toBe(7);
    expect([...dow].map((d) => d.textContent)).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
  });
});
