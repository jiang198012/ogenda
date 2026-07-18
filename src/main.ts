import { Plugin, Notice } from "obsidian";
import { OgendaSettings, sanitizeSettings } from "./settings/settings";
import { OgendaSettingTab } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { GmailImapConnector } from "./connectors/gmail-imap";
import { CalDavConnector } from "./connectors/caldav/caldav-connector";
import { CalDavWriter } from "./connectors/caldav/caldav-writer";
import { SyncService } from "./sync/sync-service";
import { syncBidirectional, CalDavSource } from "./sync/bidirectional";
import { davRequest, hrefInside } from "./net/dav-request";
import { AgendaPanelView, AGENDA_PANEL_VIEW_TYPE } from "./agenda-panel/agenda-panel-view";

const XML_CT = "application/xml; charset=utf-8";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({ id: "ogenda-sync-now", name: "Sync now (Gmail invites)", callback: () => void this.syncNow() });
    this.addCommand({
      id: "ogenda-caldav-sync",
      name: "Sync iCloud calendar",
      callback: () => void this.caldavSync(),
    });
    this.addCommand({
      id: "ogenda-caldav-sync-bidirectional",
      name: "Sync iCloud (two-way)",
      callback: () => void this.caldavSyncTwoWay(),
    });
    this.addCommand({
      id: "ogenda-caldav-discovery",
      name: "CalDAV discovery probe (iCloud)",
      callback: () => void this.caldavDiscover(),
    });

    this.registerView(AGENDA_PANEL_VIEW_TYPE, (leaf) => new AgendaPanelView(leaf, this.store(), this.settings.storageFolder));
    this.addCommand({
      id: "ogenda-open-agenda-panel",
      name: "Open Agenda panel",
      callback: () => void this.openAgendaPanel(),
    });
    this.addRibbonIcon("calendar-days", "Open Agenda panel", () => void this.openAgendaPanel());

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncNow());
    }
  }

  private store(): MonthlyStore {
    return new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
  }

  async syncNow(): Promise<void> {
    if (!this.settings.email || !this.settings.appPassword) {
      new Notice("请先在 ogenda 设置里填 Gmail 地址 + App 密码");
      return;
    }
    const connector = new GmailImapConnector(
      { email: this.settings.email, appPassword: this.settings.appPassword },
      this.settings.scanCount,
    );
    const svc = new SyncService([connector], this.store(), (m) => new Notice(m, 10000));
    try {
      await svc.syncNow();
    } catch (e) {
      new Notice("同步出错: " + (e as Error).message);
      console.error("[ogenda] syncNow error", e);
    }
  }

  async caldavSync(): Promise<void> {
    const c = this.icloudCreds();
    if (!c || !this.settings.icloudCalUrl) {
      new Notice("先填 iCloud 凭据 + 日历 URL(用 discovery 探针拿 URL)");
      return;
    }
    const connector = new CalDavConnector({
      user: c.user,
      pass: c.pass,
      calendarUrl: this.settings.icloudCalUrl,
      label: "icloud",
    });
    const svc = new SyncService([connector], this.store(), (m) => new Notice(m, 10000));
    try {
      await svc.syncNow();
    } catch (e) {
      new Notice("iCloud 同步出错: " + (e as Error).message);
      console.error("[ogenda] caldav sync error", e);
    }
  }

  async caldavSyncTwoWay(): Promise<void> {
    const c = this.icloudCreds();
    if (!c || !this.settings.icloudCalUrl) {
      new Notice("先填 iCloud 凭据 + 日历 URL(用 discovery 探针拿 URL)");
      return;
    }
    const connector = new CalDavConnector({
      user: c.user,
      pass: c.pass,
      calendarUrl: this.settings.icloudCalUrl,
      label: "icloud",
    });
    const writer = new CalDavWriter({ user: c.user, pass: c.pass });
    const source: CalDavSource = {
      fetch: () => connector.fetch(),
      putEvent: (url, ics, ifMatch) => writer.putEvent(url, ics, ifMatch),
      deleteEvent: (url, ifMatch) => writer.deleteEvent(url, ifMatch),
    };
    try {
      await syncBidirectional(source, this.settings.icloudCalUrl, this.store(), (m) => new Notice(m, 10000));
    } catch (e) {
      new Notice("iCloud 双向同步出错: " + (e as Error).message);
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

  // --- iCloud CalDAV discovery helper (prints calendar URLs to console) ---

  private icloudCreds(): { user: string; pass: string } | null {
    const user = this.settings.icloudUser;
    const pass = this.settings.icloudAppPassword;
    if (!user || !pass) {
      new Notice("先在设置里填 iCloud 邮箱 + App 专用密码");
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
        new Notice(`discovery: principal=${r1.status},没解析到 href(见控制台)`);
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
        new Notice(`discovery: home=${r2.status},没解析到 calendar-home(见控制台)`);
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
        `discovery: principal=${r1.status} home=${r2.status} calendars=${r3.status}。日历列表见控制台;完整 URL = ${home.origin} + 某日历路径,粘进设置「iCloud 日历 URL」。`,
      );
    } catch (e) {
      console.error("[ogenda] discovery failed", e);
      new Notice("discovery 出错: " + (e as Error).message);
    }
  }

  async loadSettings() {
    this.settings = sanitizeSettings(await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
