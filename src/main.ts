import { Plugin, Notice, Editor } from "obsidian";
import { OgendaSettings, sanitizeSettings } from "./settings/settings";
import { OgendaSettingTab, getObsidianLocale } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { CalDavConnector } from "./connectors/caldav/caldav-connector";
import { parseCalendarList, DiscoveredCalendar } from "./connectors/caldav/parse-calendar-list";
import { CalDavWriter } from "./connectors/caldav/caldav-writer";
import { IcsConnector } from "./connectors/ics/ics-connector";
import { SyncService } from "./sync/sync-service";
import { syncBidirectional, CalDavSource } from "./sync/bidirectional";
import { resolveSyncProvider } from "./sync/resolve-provider";
import { davRequest, hrefInside } from "./net/dav-request";
import { AgendaPanelView, AGENDA_PANEL_VIEW_TYPE } from "./agenda-panel/agenda-panel-view";
import { QuickAddModal } from "./agenda-panel/quick-add-modal";
import { todayInTimezone } from "./agenda-panel/timezone";
import { localToEvent } from "./agenda-panel/local-to-event";
import { nextDueReminder } from "./agenda-panel/reminders";
import { setLanguage, resolveLanguage, t } from "./i18n";
import { getDefaultCategory } from "./agenda-panel/event-form-fields";
import { startOfDay, startOfWeek, addDays } from "./agenda-panel/date-grid";
import { buildAgendaText, AgendaText, AgendaTextStyle } from "./agenda-panel/agenda-text";

const XML_CT = "application/xml; charset=utf-8";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;

  async onload() {
    // Anything here that throws would abort onload and leave the plugin with no
    // commands and no ribbon icon, which reads as "the plugin has no commands"
    // rather than as a failure. Fall back to defaults and carry on instead.
    try {
      // 先定语言再加载设置:sanitizeSettings 会用当前语言生成默认时间线分区名。
      // 优先用已存设置的 language(data.json),其次 Obsidian locale——
      // localStorage.getItem("language") 在部分 Obsidian 版本里是 null。
      const raw = (await this.loadData()) as { language?: string } | null;
      const preferred =
        raw?.language === "zh" || raw?.language === "en"
          ? raw.language
          : resolveLanguage("auto", getObsidianLocale());
      setLanguage(preferred);
      await this.loadSettings();
      setLanguage(resolveLanguage(this.settings.language, getObsidianLocale()));
      if (!this.settings.defaultCategory) {
        this.settings.defaultCategory = getDefaultCategory();
        await this.saveSettings();
      }
    } catch (e) {
      console.error("[ogenda] settings load failed; falling back to defaults", e);
      this.settings = sanitizeSettings(null);
      setLanguage(resolveLanguage(this.settings.language, getObsidianLocale()));
    }
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-sync-now",
      name: t("command.syncNow"),
      callback: () => void this.syncCalendarNow(),
    });
    this.addCommand({
      id: "ogenda-caldav-discovery",
      name: t("command.discovery"),
      callback: () => void this.caldavDiscover(),
    });
    this.addCommand({
      id: "ogenda-quick-add",
      name: t("command.quickAdd"),
      callback: () => {
        new QuickAddModal(
          this.app,
          todayInTimezone(this.settings.timezone),
          this.settings.defaultCategory || getDefaultCategory(),
          async (event) => {
            await this.store().savePanelEvent(event);
            this.refreshOpenPanels();
            void this.syncCalendarNow();
          },
          this.settings.defaultReminderMinutes,
        ).open();
      },
    });

    this.addCommand({
      id: "ogenda-copy-day-agenda",
      name: t("command.copyDayAgenda"),
      callback: () => void this.copyAgendaAsText("day"),
    });
    this.addCommand({
      id: "ogenda-copy-week-agenda",
      name: t("command.copyWeekAgenda"),
      callback: () => void this.copyAgendaAsText("week"),
    });
    this.addCommand({
      id: "ogenda-insert-day-agenda",
      name: t("command.insertDayAgenda"),
      editorCallback: (editor) => void this.insertAgendaIntoNote(editor, "day"),
    });
    this.addCommand({
      id: "ogenda-insert-week-agenda",
      name: t("command.insertWeekAgenda"),
      editorCallback: (editor) => void this.insertAgendaIntoNote(editor, "week"),
    });

    this.registerView(
      AGENDA_PANEL_VIEW_TYPE,
      (leaf) =>
        new AgendaPanelView(
          leaf,
          // Getters, not snapshots: settings changed while the panel is open must
          // take effect without reopening it (storage folder used to be captured here).
          () => this.store(),
          () => this.settings.storageFolder,
          this.settings.timezone,
          () => this.syncCalendarNow(),
          () => this.settings.syncProvider,
          () => this.settings.defaultCategory,
          () => this.settings.defaultReminderMinutes,
          () => this.settings.timeSegments,
        ),
    );
    this.addCommand({
      id: "ogenda-open-agenda-panel",
      name: t("command.openPanel"),
      callback: () => void this.openAgendaPanel(),
    });
    this.addRibbonIcon("calendar-days", t("command.openPanel"), () => void this.openAgendaPanel());

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncCalendarNow());
    }

    // 提醒:定时器常驻,但只在设置开启时干活(README「不偷跑后台任务」原则)。
    this.registerInterval(window.setInterval(() => void this.checkReminders(), 30_000));
    this.app.workspace.onLayoutReady(() => void this.checkReminders());
  }

  /** 已触发的提醒(uid + occurrence 起始时间),避免同一条重复弹。 */
  private firedReminders = new Set<string>();

  async checkReminders(): Promise<void> {
    if (!this.settings.remindersEnabled) return;
    // 事件时间按「本地墙钟」存储(面板表单/quick-add 的输入即本地墙钟),
    // now 必须用同一域——不能用 todayInTimezone(设置时区),否则时区 ≠ 系统时区时
    // 两个墙钟错位(如 EDT 机器 + Asia/Shanghai 设置),提醒永远不会到点。
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const nowIso = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    try {
      const { events } = await this.store().readEvents();
      const ag = events.map(localToEvent);
      const due = nextDueReminder(ag, nowIso);
      if (!due) return;
      // Include the trigger time so separate reminders on one occurrence can
      // each fire once (the old uid|start key suppressed the later one).
      const key = `${due.uid}|${due.start}|${due.due}`;
      if (this.firedReminders.has(key)) return;
      if (this.firedReminders.size > 500) this.firedReminders.clear();
      this.firedReminders.add(key);
      new Notice(t("reminder.notice", { title: due.title, time: due.start.slice(11, 16) }), 10000);
    } catch (e) {
      console.error("[ogenda] reminder check failed", e);
    }
  }

  private store(): MonthlyStore {
    return new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
  }

  // --- 日程文本导出 / 笔记插入(与面板同一条事件管线,保证导出即所见)---

  private agendaScopeRange(scope: "day" | "week"): { start: Date; end: Date } {
    const today = startOfDay(todayInTimezone(this.settings.timezone));
    if (scope === "day") return { start: today, end: addDays(today, 1) };
    const weekStart = startOfWeek(today);
    return { start: weekStart, end: addDays(weekStart, 7) };
  }

  private async buildAgenda(scope: "day" | "week", style: AgendaTextStyle): Promise<AgendaText> {
    const { start, end } = this.agendaScopeRange(scope);
    const { events, skipped } = await this.store().readEvents();
    if (skipped > 0) new Notice(t("notice.unreadableBlocks", { count: skipped }), 10000);
    return buildAgendaText(events.map(localToEvent), start, end, style);
  }

  private async copyAgendaAsText(scope: "day" | "week"): Promise<void> {
    try {
      const r = await this.buildAgenda(scope, "plain");
      if (r.count === 0) {
        new Notice(t("notice.agendaEmpty"));
        return;
      }
      await navigator.clipboard.writeText(r.text);
      new Notice(t("notice.agendaCopied", { count: r.count }));
    } catch (e) {
      new Notice(t("notice.agendaExportError", { msg: (e as Error).message }), 10000);
      console.error("[ogenda] copy agenda failed", e);
    }
  }

  private async insertAgendaIntoNote(editor: Editor, scope: "day" | "week"): Promise<void> {
    // 先快照选区:await 读事件期间用户可能移动光标,replaceSelection 会落在调用时刻的选区上。
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    try {
      const r = await this.buildAgenda(scope, "markdown");
      if (r.count === 0) {
        new Notice(t("notice.agendaEmpty"));
        return;
      }
      editor.replaceRange(r.text + "\n", from, to);
    } catch (e) {
      new Notice(t("notice.agendaExportError", { msg: (e as Error).message }), 10000);
      console.error("[ogenda] insert agenda failed", e);
    }
  }

  async syncCalendarNow(): Promise<void> {
    const r = resolveSyncProvider(this.settings);
    if (r.provider === "none") {
      new Notice(t("notice.noSyncProvider"));
      return;
    }
    if (r.provider === "incomplete") {
      new Notice(t("notice.syncIncomplete"));
      return;
    }
    if (r.provider === "ics") {
      try {
        const svc = new SyncService([new IcsConnector(r.url)], this.store(), (m) => new Notice(m, 10000));
        await svc.syncNow();
      } catch (e) {
        new Notice(t("notice.icsImportError", { msg: (e as Error).message }));
        console.error("[ogenda] ics import error", e);
      } finally {
        this.refreshOpenPanels();
        void this.checkReminders();
      }
      return;
    }
    // icloud | caldav → bidirectional
    const connector = new CalDavConnector({ user: r.user, pass: r.pass, calendarUrl: r.calUrl, label: r.provider });
    const writer = new CalDavWriter({ user: r.user, pass: r.pass });
    const source: CalDavSource = {
      fetch: () => connector.fetch(),
      putEvent: (url, ics, ifMatch) => writer.putEvent(url, ics, ifMatch),
      deleteEvent: (url, ifMatch) => writer.deleteEvent(url, ifMatch),
    };
    try {
      await syncBidirectional(source, r.calUrl, this.store(), (m) => new Notice(m, 10000));
    } catch (e) {
      new Notice(t("notice.twoWaySyncError", { msg: (e as Error).message }));
      console.error("[ogenda] bidirectional sync error", e);
    } finally {
      // Sync rewrote the monthly files; open panels still hold the pre-sync read.
      this.refreshOpenPanels();
      void this.checkReminders();
    }
  }

  async openAgendaPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(AGENDA_PANEL_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: AGENDA_PANEL_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  refreshOpenPanels(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(AGENDA_PANEL_VIEW_TYPE)) {
      const v = leaf.view as AgendaPanelView;
      if (typeof (v as unknown as { rerender?: () => void }).rerender === "function") {
        (v as unknown as { rerender: () => void }).rerender();
      }
    }
  }

  // --- iCloud CalDAV discovery helper ---

  /** Discover the account's writable iCloud calendars. Throws with a user-facing message on failure. */
  async caldavListCalendars(): Promise<DiscoveredCalendar[]> {
    const user = this.settings.icloudUser;
    const pass = this.settings.icloudAppPassword;
    if (!user || !pass) throw new Error(t("notice.needIcloudCreds"));
    const c = { user, pass };

    const r1 = await davRequest({
      url: "https://caldav.icloud.com/",
      method: "PROPFIND",
      ...c,
      depth: "0",
      contentType: XML_CT,
      body: `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    });
    const principalHref = hrefInside(r1.text, "current-user-principal");
    if (!principalHref) {
      console.log("[ogenda] principal", r1.status, "\n" + r1.text);
      throw new Error(t("notice.discoveryNoPrincipal", { status: r1.status }));
    }
    const principalUrl = principalHref.startsWith("http")
      ? principalHref
      : "https://caldav.icloud.com" + principalHref;

    const r2 = await davRequest({
      url: principalUrl,
      method: "PROPFIND",
      ...c,
      depth: "0",
      contentType: XML_CT,
      body: `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    });
    const homeHref = hrefInside(r2.text, "calendar-home-set");
    if (!homeHref) {
      console.log("[ogenda] home", r2.status, "\n" + r2.text);
      throw new Error(t("notice.discoveryNoHome", { status: r2.status }));
    }

    const r3 = await davRequest({
      url: homeHref,
      method: "PROPFIND",
      ...c,
      depth: "1",
      contentType: XML_CT,
      body: `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
    });
    if (r3.status < 200 || r3.status >= 300) {
      console.log("[ogenda] calendars", r3.status, "\n" + r3.text);
      throw new Error(t("notice.discoveryFailed", { status: r3.status }));
    }
    return parseCalendarList(r3.text, homeHref);
  }

  async caldavDiscover(): Promise<void> {
    try {
      const cals = await this.caldavListCalendars();
      console.log("[ogenda] calendars", cals);
      new Notice(cals.length ? t("notice.discoveryDone", { count: cals.length }) : t("notice.discoveryEmpty"));
    } catch (e) {
      console.error("[ogenda] discovery failed", e);
      new Notice(t("notice.discoveryError", { msg: (e as Error).message }), 10000);
    }
  }

  async loadSettings() {
    this.settings = sanitizeSettings(await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
