// src/agenda-panel/agenda-panel-view.ts
import { ItemView, WorkspaceLeaf, ConfirmationModal, Notice } from "obsidian";
import { AgendaEvent } from "../core/event";
import { LocalEvent, MonthlyStore } from "../store/monthly-store";
import { expandOccurrences } from "./occurrences";
import { startOfWeek, startOfDay, addDays, monthGridWeeks, toDateKey } from "./date-grid";
import { openEventSource } from "./navigate";
import { todayInTimezone } from "./timezone";
import { computeStats } from "./stats";
import { EventFormModal } from "./event-form-modal";
import { renderListView } from "./views/list-view";
import { renderDayView } from "./views/day-view";
import { renderWeekView } from "./views/week-view";
import { renderMonthView } from "./views/month-view";
import { renderStatsView } from "./views/stats-view";
import { renderMiniCalendar } from "./mini-calendar";

export const AGENDA_PANEL_VIEW_TYPE = "ogenda-agenda-panel";

type Tab = "list" | "day" | "week" | "month" | "stats";

export class AgendaPanelView extends ItemView {
  private tab: Tab = "list";
  private anchor: Date;

  constructor(
    leaf: WorkspaceLeaf,
    private store: MonthlyStore,
    private folder: string,
    private timezone: string | undefined,
    private triggerSync: () => void,
  ) {
    super(leaf);
    this.anchor = this.safeToday();
  }

  private safeToday(): Date {
    try {
      return todayInTimezone(this.timezone);
    } catch {
      return new Date();
    }
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
    if (this.tab === "month" || this.tab === "stats") {
      const weeks = monthGridWeeks(this.anchor);
      return { start: weeks[0][0], end: addDays(weeks[weeks.length - 1][6], 1) };
    }
    // list: from the anchor date onward, 60-day rolling window
    const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
    return { start, end: addDays(start, 60) };
  }

  private existingCategories(events: AgendaEvent[]): string[] {
    return [...new Set(events.map((e) => e.category).filter((c): c is string => Boolean(c)))].sort();
  }

  private async saveEvent(event: AgendaEvent): Promise<void> {
    await this.store.sync([event]);
    this.triggerSync();
    await this.render();
  }

  private confirmDelete(event: AgendaEvent): void {
    const modal = new ConfirmationModal(this.app);
    modal.setTitle("删除事件");
    modal.contentEl.createEl("p", { text: `确定删除《${event.title}》吗?这会同步删除 iCloud 上的对应事件。` });
    modal.addButton((btn) =>
      btn
        .setButtonText("删除")
        .setDestructive()
        .onClick(async () => {
          await this.store.removeByUid([event.uid]);
          this.triggerSync();
          await this.render();
        }),
    );
    modal.addCancelButton("取消");
    modal.open();
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
      { key: "stats", label: "统计" },
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
    const isToday = startOfDay(this.anchor).getTime() === startOfDay(this.safeToday()).getTime();
    const todayBtn = nav.createSpan({
      cls: "ogenda-navbtn ogenda-navtoday",
      text: isToday ? `今天 · ${this.anchor.toDateString()}` : this.anchor.toDateString(),
    });
    todayBtn.addEventListener("click", () => {
      this.anchor = this.safeToday();
      void this.render();
    });
    const next = nav.createSpan({ cls: "ogenda-navbtn", text: "›" });
    next.addEventListener("click", () => {
      this.anchor = this.shiftAnchor(1);
      void this.render();
    });

    const body = container.createDiv({ cls: "ogenda-panel-body" });
    try {
      const local: LocalEvent[] = await this.store.readEvents();
      const events: AgendaEvent[] = local.map((l) => this.localToEvent(l));
      const categories = this.existingCategories(events);

      const newBtn = head.createDiv({ cls: "ogenda-panel-newbtn", text: "+ 新建" });
      newBtn.addEventListener("click", () => {
        new EventFormModal(
          this.app,
          null,
          toDateKey(this.anchor),
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
      });

      const onEventClick = (event: AgendaEvent) => {
        new EventFormModal(
          this.app,
          event,
          undefined,
          categories,
          (updated) => void this.saveEvent(updated),
          () => void openEventSource(this.app, this.folder, event),
          () => this.confirmDelete(event),
        ).open();
      };
      const onEmptyClick = (day: Date) => {
        new EventFormModal(
          this.app,
          null,
          toDateKey(day),
          categories,
          (created) => void this.saveEvent(created),
          undefined,
          undefined,
        ).open();
      };

      if (this.tab === "stats") {
        const { start } = this.rangeForTab();
        renderStatsView(body, computeStats(events, local, start));
      } else {
        const { start, end } = this.rangeForTab();
        const occurrences = expandOccurrences(events, start, end);
        if (this.tab === "list") renderListView(body, occurrences, onEventClick);
        else if (this.tab === "day") {
          const dayWrap = body.createDiv({ cls: "ogenda-day-layout" });
          const dayMain = dayWrap.createDiv({ cls: "ogenda-day-main" });
          const daySide = dayWrap.createDiv({ cls: "ogenda-day-side" });
          renderDayView(dayMain, occurrences, onEventClick);
          renderMiniCalendar(daySide, this.anchor, (day) => {
            this.anchor = day;
            void this.render();
          });
        } else if (this.tab === "week") renderWeekView(body, occurrences, this.anchor, onEventClick, onEmptyClick);
        else renderMonthView(body, occurrences, this.anchor, onEventClick, onEmptyClick);
      }
    } catch (e) {
      new Notice("Agenda 面板加载出错: " + (e as Error).message);
      console.error("[ogenda] agenda panel render error", e);
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
  private localToEvent(local: LocalEvent): AgendaEvent {
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
