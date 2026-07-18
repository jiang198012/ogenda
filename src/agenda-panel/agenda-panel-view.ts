import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { AgendaEvent } from "../core/event";
import { MonthlyStore } from "../store/monthly-store";
import { expandOccurrences } from "./occurrences";
import { startOfWeek, addDays, monthGridWeeks } from "./date-grid";
import { openEventSource } from "./navigate";
import { renderListView } from "./views/list-view";
import { renderDayView } from "./views/day-view";
import { renderWeekView } from "./views/week-view";
import { renderMonthView } from "./views/month-view";

export const AGENDA_PANEL_VIEW_TYPE = "ogenda-agenda-panel";

type Tab = "list" | "day" | "week" | "month";

export class AgendaPanelView extends ItemView {
  private tab: Tab = "list";
  private anchor: Date = new Date();

  constructor(leaf: WorkspaceLeaf, private store: MonthlyStore, private folder: string) {
    super(leaf);
  }

  getViewType(): string {
    return AGENDA_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Agenda";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  private rangeForTab(): { start: Date; end: Date } {
    if (this.tab === "day") {
      const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
      return { start, end: addDays(start, 1) };
    }
    if (this.tab === "week") {
      const start = startOfWeek(this.anchor);
      return { start, end: addDays(start, 7) };
    }
    if (this.tab === "month") {
      const weeks = monthGridWeeks(this.anchor);
      return { start: weeks[0][0], end: addDays(weeks[weeks.length - 1][6], 1) };
    }
    // list: from the anchor date onward, 60-day rolling window
    const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
    return { start, end: addDays(start, 60) };
  }

  private async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("ogenda-panel");

    const head = container.createDiv({ cls: "ogenda-panel-head" });
    const tabs = head.createDiv({ cls: "ogenda-panel-tabs" });
    const tabDefs: { key: Tab; label: string }[] = [
      { key: "list", label: "清单" },
      { key: "day", label: "日" },
      { key: "week", label: "周" },
      { key: "month", label: "月" },
    ];
    for (const t of tabDefs) {
      const el = tabs.createDiv({ cls: "ogenda-panel-tab" + (this.tab === t.key ? " active" : ""), text: t.label });
      el.addEventListener("click", () => {
        this.tab = t.key;
        void this.render();
      });
    }

    const nav = head.createDiv({ cls: "ogenda-panel-nav" });
    const prev = nav.createSpan({ cls: "ogenda-navbtn", text: "‹" });
    prev.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(-1);
      void this.render();
    });
    nav.createSpan({ text: this.anchor.toDateString() });
    const next = nav.createSpan({ cls: "ogenda-navbtn", text: "›" });
    next.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(1);
      void this.render();
    });

    const body = container.createDiv({ cls: "ogenda-panel-body" });
    try {
      const { start, end } = this.rangeForTab();
      const events: AgendaEvent[] = await this.store.readEvents().then((local) =>
        local.map((l) => this.localToEvent(l)),
      );
      const occurrences = expandOccurrences(events, start, end);
      const onEventClick = (event: AgendaEvent) => void openEventSource(this.app, this.folder, event);

      if (this.tab === "list") renderListView(body, occurrences, new Date(), onEventClick);
      else if (this.tab === "day") renderDayView(body, occurrences, onEventClick);
      else if (this.tab === "week") renderWeekView(body, occurrences, this.anchor, onEventClick);
      else renderMonthView(body, occurrences, this.anchor, onEventClick);
    } catch (err) {
      console.error("[ogenda] Agenda panel failed to load events", err);
      new Notice("Agenda 面板加载出错: " + (err as Error).message);
    }
  }

  private shiftAnchor(dir: 1 | -1): Date {
    if (this.tab === "day") return addDays(this.anchor, dir);
    if (this.tab === "week" || this.tab === "list") return addDays(this.anchor, dir * 7);
    const targetMonth = this.anchor.getMonth() + dir;
    const daysInTarget = new Date(this.anchor.getFullYear(), targetMonth + 1, 0).getDate();
    const day = Math.min(this.anchor.getDate(), daysInTarget);
    return new Date(this.anchor.getFullYear(), targetMonth, day);
  }

  // MonthlyStore.readEvents() 返回的是原始字段(LocalEvent),不是 AgendaEvent —— 面板只读展示,
  // 复用 store/monthly-store.ts 的字段命名(snake_case)转换成 AgendaEvent 展示用的最小子集。
  private localToEvent(local: { uid: string; fields: Record<string, string> }): AgendaEvent {
    const f = local.fields;
    return {
      uid: local.uid,
      title: f.title ?? "",
      start: f.start ?? "",
      end: f.end,
      allDay: f.all_day === "true",
      location: f.location,
      organizer: f.organizer,
      attendees: f.attendees ? f.attendees.split(", ") : undefined,
      status: f.status,
      rsvp: f.rsvp,
      category: f.category,
      tags: f.tags ? f.tags.split(", ") : undefined,
      rrule: f.rrule,
      origin: "synced",
    };
  }
}
