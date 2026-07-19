import { Plugin, Notice } from "obsidian";
import { OgendaSettings, sanitizeSettings } from "./settings/settings";
import { OgendaSettingTab, getObsidianLocale } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { CalDavConnector } from "./connectors/caldav/caldav-connector";
import { CalDavWriter } from "./connectors/caldav/caldav-writer";
import { IcsConnector } from "./connectors/ics/ics-connector";
import { SyncService } from "./sync/sync-service";
import { syncBidirectional, CalDavSource } from "./sync/bidirectional";
import { resolveSyncProvider } from "./sync/resolve-provider";
import { davRequest, hrefInside } from "./net/dav-request";
import { AgendaPanelView, AGENDA_PANEL_VIEW_TYPE } from "./agenda-panel/agenda-panel-view";
import { setLanguage, resolveLanguage, t } from "./i18n";

const XML_CT = "application/xml; charset=utf-8";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;

  async onload() {
    await this.loadSettings();
    setLanguage(resolveLanguage(this.settings.language, getObsidianLocale()));
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

    this.registerView(
      AGENDA_PANEL_VIEW_TYPE,
      (leaf) =>
        new AgendaPanelView(
          leaf,
          this.store(),
          this.settings.storageFolder,
          this.settings.timezone,
          () => void this.syncCalendarNow(),
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
  }

  private store(): MonthlyStore {
    return new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
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

  // --- iCloud CalDAV discovery helper (prints calendar URLs to console) ---

  private icloudCreds(): { user: string; pass: string } | null {
    const user = this.settings.icloudUser;
    const pass = this.settings.icloudAppPassword;
    if (!user || !pass) {
      new Notice(t("notice.needIcloudCreds"));
      return null;
    }
    return { user, pass };
  }

  async caldavDiscover(): Promise<void> {
    const c = this.icloudCreds();
    if (!c) return;
    try {
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
        new Notice(t("notice.discoveryNoPrincipal", { status: r1.status }));
        console.log("[ogenda] principal", r1.status, "\n" + r1.text);
        return;
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
        new Notice(t("notice.discoveryNoHome", { status: r2.status }));
        console.log("[ogenda] home", r2.status, "\n" + r2.text);
        return;
      }

      const r3 = await davRequest({
        url: homeHref,
        method: "PROPFIND",
        ...c,
        depth: "1",
        contentType: XML_CT,
        body: `<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
      });
      console.log("[ogenda] calendars status", r3.status, "\n" + r3.text);
      const home = new URL(homeHref);
      new Notice(
        t("notice.discoveryDone", { principal: r1.status, home: r2.status, calendars: r3.status, origin: home.origin }),
      );
    } catch (e) {
      console.error("[ogenda] discovery failed", e);
      new Notice(t("notice.discoveryError", { msg: (e as Error).message }));
    }
  }

  async loadSettings() {
    this.settings = sanitizeSettings(await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
