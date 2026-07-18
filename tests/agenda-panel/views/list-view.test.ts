// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { AgendaEvent } from "../../../src/core/event";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderListView } from "../../../src/agenda-panel/views/list-view";

const mkOcc = (uid: string, start: string, title: string, location?: string): EventOccurrence => ({
  event: { uid, title, start, location, origin: "synced" },
  start,
});

describe("renderListView", () => {
  it("groups occurrences by day and renders title/location", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-18T10:00:00", "周会同步", "线上"),
      mkOcc("b", "2026-07-20T14:00:00", "项目评审", "会议室 B"),
    ];
    renderListView(container, occs, new Date(2026, 6, 18), () => {});

    const groups = container.querySelectorAll(".ogenda-list-daygroup");
    expect(groups.length).toBe(2);
    expect(container.textContent).toContain("周会同步");
    expect(container.textContent).toContain("线上");
    expect(container.textContent).toContain("项目评审");
  });

  it("calls onEventClick with the underlying AgendaEvent when a row is clicked", () => {
    const container = document.createElement("div");
    const occ = mkOcc("a", "2026-07-18T10:00:00", "周会同步");
    const onClick = vi.fn();
    renderListView(container, [occ], new Date(2026, 6, 18), onClick);

    const row = container.querySelector(".ogenda-event-row") as HTMLElement;
    row.click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });

  it("renders nothing but no error for an empty occurrence list", () => {
    const container = document.createElement("div");
    expect(() => renderListView(container, [], new Date(2026, 6, 18), () => {})).not.toThrow();
    expect(container.querySelectorAll(".ogenda-list-daygroup").length).toBe(0);
  });
});
