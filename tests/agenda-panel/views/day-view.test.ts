// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { renderDayView } from "../../../src/agenda-panel/views/day-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";
import { setLanguage } from "../../../src/i18n";

beforeEach(() => setLanguage("zh"));

describe("renderDayView", () => {
  it("renders all present calendar fields but omits absent ones and sync metadata", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "团队周会", start: "2026-07-16T14:00:00", end: "2026-07-16T15:00:00",
      allDay: false, location: "会议室 A", organizer: "alice@example.com",
      attendees: ["alice@example.com", "bob@example.com"], status: "confirmed", rsvp: "accepted",
      origin: "synced", href: "https://example.com/a.ics", etag: '"e1"',
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start, end: ev.end }], () => {});

    expect(container.textContent).toContain("团队周会");
    expect(container.textContent).toContain("会议室 A");
    expect(container.textContent).toContain("alice@example.com");
    expect(container.textContent).toContain("已确认");
    expect(container.textContent).toContain("accepted");
    expect(container.textContent).not.toContain("https://example.com/a.ics");
    expect(container.textContent).not.toContain('"e1"');
  });

  it("omits a field row entirely when the field is absent (no empty label)", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "全员大会", start: "2026-07-20", allDay: true, origin: "synced" };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {});
    expect(container.querySelectorAll(".ogenda-field-row").length).toBe(0);
  });

  it("calls onEventClick when a card is clicked", () => {
    const ev: AgendaEvent = { uid: "a@x", title: "会议", start: "2026-07-16T14:00:00", origin: "synced" };
    const container = document.createElement("div");
    const onClick = vi.fn();
    renderDayView(container, [{ event: ev, start: ev.start }], onClick);
    (container.querySelector(".ogenda-day-card") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(ev);
  });

  it("colors the card's left bar from the category and shows a status pill", () => {
    const ev: AgendaEvent = {
      uid: "a@x", title: "评审会", start: "2026-07-16T14:00:00", status: "confirmed", category: "工作", origin: "synced",
    };
    const container = document.createElement("div");
    renderDayView(container, [{ event: ev, start: ev.start }], () => {}, createColorResolver());
    const card = container.querySelector(".ogenda-day-card") as HTMLElement;
    expect(card.style.borderLeftColor).not.toBe("");
    expect(container.querySelector(".ogenda-status-pill")?.textContent).toBe("已确认");
  });
});
