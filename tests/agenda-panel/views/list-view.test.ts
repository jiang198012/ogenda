// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { EventOccurrence } from "../../../src/agenda-panel/occurrences";
import { renderListView } from "../../../src/agenda-panel/views/list-view";
import { createColorResolver } from "../../../src/agenda-panel/colors";

const mkOcc = (uid: string, start: string, title: string, status?: string, location?: string): EventOccurrence => ({
  event: { uid, title, start, status, location, origin: "synced" },
  start,
});

describe("renderListView", () => {
  it("groups occurrences by status, in confirmed/tentative/cancelled/未设置 order", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-20T10:00:00", "无状态事件"),
      mkOcc("b", "2026-07-18T14:00:00", "已确认事件", "confirmed"),
      mkOcc("c", "2026-07-19T09:00:00", "待定事件", "tentative"),
    ];
    renderListView(container, occs, () => {});

    const headers = container.querySelectorAll(".ogenda-list-statusheader");
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain("已确认");
    expect(headers[1].textContent).toContain("待定");
    expect(headers[2].textContent).toContain("未设置");
  });

  it("sorts events within a status group by start time ascending", () => {
    const container = document.createElement("div");
    const occs = [
      mkOcc("a", "2026-07-20T10:00:00", "晚一点", "confirmed"),
      mkOcc("b", "2026-07-18T14:00:00", "早一点", "confirmed"),
    ];
    renderListView(container, occs, () => {});
    const titles = [...container.querySelectorAll(".ogenda-event-title")].map((el) => el.textContent);
    expect(titles).toEqual(["早一点", "晚一点"]);
  });

  it("shows a count next to each status group header", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed"), mkOcc("b", "2026-07-19T09:00:00", "y", "confirmed")];
    renderListView(container, occs, () => {});
    expect(container.querySelector(".ogenda-list-statusheader")!.textContent).toContain("2");
  });

  it("collapses a group's items when its header is clicked", () => {
    const container = document.createElement("div");
    const occs = [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed")];
    renderListView(container, occs, () => {});
    const header = container.querySelector(".ogenda-list-statusheader") as HTMLElement;
    const items = container.querySelector(".ogenda-list-statusitems") as HTMLElement;
    expect(items.classList.contains("collapsed")).toBe(false);
    header.click();
    expect(items.classList.contains("collapsed")).toBe(true);
  });

  it("calls onEventClick with the underlying AgendaEvent when a row is clicked", () => {
    const container = document.createElement("div");
    const occ = mkOcc("a", "2026-07-18T14:00:00", "周会同步", "confirmed");
    const onClick = vi.fn();
    renderListView(container, [occ], onClick);
    (container.querySelector(".ogenda-event-row") as HTMLElement).click();
    expect(onClick).toHaveBeenCalledWith(occ.event);
  });

  it("renders location when present", () => {
    const container = document.createElement("div");
    renderListView(container, [mkOcc("a", "2026-07-18T14:00:00", "x", "confirmed", "线上")], () => {});
    expect(container.textContent).toContain("线上");
  });

  it("puts a status pill and a category pill on a row, and colors the left bar from the category", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "评审", start: "2026-07-18T14:00:00", status: "confirmed", category: "工作", origin: "synced" },
      start: "2026-07-18T14:00:00",
    };
    renderListView(container, [occ], () => {}, createColorResolver({}));
    const row = container.querySelector(".ogenda-event-row") as HTMLElement;
    expect(container.querySelector(".ogenda-status-pill")?.textContent).toBe("已确认");
    expect(container.querySelector(".ogenda-cat-pill")?.textContent).toBe("工作");
    expect(row.style.borderLeftColor).not.toBe("");
  });

  it("omits the status pill for an unset-status event", () => {
    const container = document.createElement("div");
    const occ: EventOccurrence = {
      event: { uid: "a", title: "无状态", start: "2026-07-18T14:00:00", origin: "synced" },
      start: "2026-07-18T14:00:00",
    };
    renderListView(container, [occ], () => {}, createColorResolver({}));
    expect(container.querySelector(".ogenda-status-pill")).toBeNull();
  });
});
