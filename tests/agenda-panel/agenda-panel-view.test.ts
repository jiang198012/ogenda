// @vitest-environment jsdom
import { beforeAll, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import { AgendaPanelView } from "../../src/agenda-panel/agenda-panel-view";
import type { MonthlyStore, ReadEventsResult } from "../../src/store/monthly-store";

// Obsidian supplies these UI primitives at runtime; keep the panel and week renderer real.
vi.mock("obsidian", () => ({
  ItemView: class { contentEl = document.createElement("div"); },
  Modal: class {},
  Notice: class {},
  setIcon: () => {},
}));

beforeAll(() => {
  Object.assign(HTMLElement.prototype, {
    empty() { this.replaceChildren(); },
    addClass(cls: string) { this.classList.add(cls); },
    setAttr(name: string, value: string) { this.setAttribute(name, value); },
    createDiv(options: { cls?: string; text?: string } = {}) { return this.createEl("div", options); },
    createSpan(options: { cls?: string; text?: string } = {}) { return this.createEl("span", options); },
    createEl(tag: string, options: { cls?: string; text?: string } = {}) {
      const el = document.createElement(tag);
      el.className = options.cls ?? "";
      el.textContent = options.text ?? "";
      this.appendChild(el);
      return el;
    },
  });
});

it("keeps the browsed week position through overlapping save/sync refreshes, but resets on week navigation", async () => {
  const empty: ReadEventsResult = { events: [], skipped: 0 };
  const readEvents = vi.fn().mockResolvedValue(empty);
  const panel = new AgendaPanelView(
    {} as WorkspaceLeaf, () => ({ readEvents }) as unknown as MonthlyStore,
    () => "Agenda", undefined, async () => {}, () => "none", () => "", () => 0, () => [],
  );
  await panel.onOpen();
  panel.contentEl.querySelectorAll<HTMLElement>(".ogenda-panel-tab")[2].click();
  await vi.waitFor(() => expect(panel.contentEl.querySelector(".ogenda-week-scroll")).not.toBeNull());

  const scroll = () => panel.contentEl.querySelector<HTMLElement>(".ogenda-week-scroll")!;
  const oldScroll = scroll();
  oldScroll.scrollLeft = 420;
  panel.contentEl.scrollTop = 160;
  const day = panel.contentEl.querySelectorAll<HTMLElement>(".ogenda-week-col")[3].dataset.day;
  const result = (title: string): ReadEventsResult => ({
    skipped: 0,
    events: [{ uid: "edited", fields: { title, start: `${day}T09:00:00` }, prose: "", hasHref: false }],
  });
  let finishOlder!: (value: ReadEventsResult) => void;
  let finishNewer!: (value: ReadEventsResult) => void;
  readEvents.mockReturnValueOnce(new Promise((resolve) => { finishOlder = resolve; }));
  readEvents.mockReturnValueOnce(new Promise((resolve) => { finishNewer = resolve; }));
  panel.rerender(); // save / sync-start
  panel.rerender(); // overlapping sync completion
  expect(scroll()).toBe(oldScroll); // no empty/loading frame that loses the viewport
  oldScroll.scrollLeft = 560; // user keeps browsing while the read is pending
  finishNewer(result("修改后的日程"));
  await vi.waitFor(() => expect(panel.contentEl.textContent).toContain("修改后的日程"));
  expect(scroll().scrollLeft).toBe(560);
  expect(panel.contentEl.scrollTop).toBe(160);

  finishOlder(result("过期的日程"));
  await Promise.resolve();
  expect(panel.contentEl.textContent).toContain("修改后的日程");
  expect(panel.contentEl.textContent).not.toContain("过期的日程");
  expect(scroll().scrollLeft).toBe(560);

  const beforeRefresh = scroll();
  panel.rerender(); // another ordinary background refresh
  await vi.waitFor(() => expect(scroll()).not.toBe(beforeRefresh));
  expect(scroll().scrollLeft).toBe(560);
  expect(panel.contentEl.scrollTop).toBe(160);

  const beforeNavigation = scroll();
  panel.contentEl.querySelectorAll<HTMLElement>(".ogenda-navbtn")[2].click();
  await vi.waitFor(() => expect(scroll()).not.toBe(beforeNavigation));
  expect(scroll().scrollLeft).toBe(0);
  expect(panel.contentEl.scrollTop).toBe(0);
});
