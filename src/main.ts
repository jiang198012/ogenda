import { Plugin, Notice } from "obsidian";
import { OgendaSettings, sanitizeSettings } from "./settings/settings";
import { OgendaSettingTab } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { GmailImapConnector } from "./connectors/gmail-imap";
import { SyncService } from "./sync/sync-service";
import { davRequest, hrefInside } from "./net/dav-request";

const XML_CT = "application/xml; charset=utf-8";
const D0_UID = "ogenda-d0-probe-1@ogenda";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({ id: "ogenda-sync-now", name: "Sync now", callback: () => void this.syncNow() });
    this.addCommand({
      id: "ogenda-caldav-discovery",
      name: "CalDAV discovery probe (iCloud)",
      callback: () => void this.caldavDiscover(),
    });
    this.addCommand({
      id: "ogenda-caldav-write",
      name: "CalDAV read + write test event (iCloud)",
      callback: () => void this.caldavWriteProbe(),
    });
    this.addCommand({
      id: "ogenda-caldav-delete",
      name: "CalDAV delete test event (iCloud)",
      callback: () => void this.caldavDeleteProbe(),
    });

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncNow());
    }
  }

  async syncNow(): Promise<void> {
    if (!this.settings.email || !this.settings.appPassword) {
      new Notice("请先在 ogenda 设置里填 Gmail 地址 + App 密码");
      return;
    }
    const store = new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
    const connector = new GmailImapConnector(
      { email: this.settings.email, appPassword: this.settings.appPassword },
      this.settings.scanCount,
    );
    const svc = new SyncService([connector], store, (m) => new Notice(m));
    try {
      await svc.syncNow();
    } catch (e) {
      new Notice("同步出错: " + (e as Error).message);
      console.error("[ogenda] syncNow error", e);
    }
  }

  // --- D0 CalDAV transport spike ---

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
      console.log("[ogenda] principal status", r1.status, "\n" + r1.text);
      const principalHref = hrefInside(r1.text, "current-user-principal");
      if (!principalHref) {
        new Notice(`discovery: principal=${r1.status},没解析到 href(见控制台)`);
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
      console.log("[ogenda] home status", r2.status, "\n" + r2.text);
      const homeHref = hrefInside(r2.text, "calendar-home-set");
      if (!homeHref) {
        new Notice(`discovery: home=${r2.status},没解析到 calendar-home(见控制台)`);
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
      new Notice(
        `discovery: principal=${r1.status} home=${r2.status} calendars=${r3.status}。日历列表见控制台,挑一个 href 填进设置「iCloud 日历 URL」。`,
      );
    } catch (e) {
      console.error("[ogenda] discovery failed", e);
      new Notice("discovery 出错: " + (e as Error).message);
    }
  }

  private d0EventUrl(): string {
    // resource filename need not equal the VEVENT UID; keep it URL-safe (no '@').
    return this.settings.icloudCalUrl.replace(/\/?$/, "/") + "ogenda-d0-probe-1.ics";
  }

  async caldavWriteProbe(): Promise<void> {
    const c = this.icloudCreds();
    if (!c || !this.settings.icloudCalUrl) {
      new Notice("先填 iCloud 凭据 + 日历 URL(先跑 discovery 拿 URL)");
      return;
    }
    try {
      const q = await davRequest({
        url: this.settings.icloudCalUrl,
        method: "REPORT",
        ...c,
        depth: "1",
        contentType: XML_CT,
        body: `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>`,
      });
      console.log("[ogenda] query status", q.status, "\n" + q.text.slice(0, 2000));

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ogenda//d0//EN",
        "BEGIN:VEVENT",
        `UID:${D0_UID}`,
        "DTSTAMP:20260714T090000Z",
        "DTSTART:20260718T060000Z",
        "DTEND:20260718T070000Z",
        "SUMMARY:ogenda D0 测试事件",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      const put = await davRequest({
        url: this.d0EventUrl(),
        method: "PUT",
        ...c,
        contentType: "text/calendar; charset=utf-8",
        body: ics,
      });
      console.log("[ogenda] PUT status", put.status, "etag", put.etag, "url", this.d0EventUrl());
      new Notice(
        `read=${q.status} put=${put.status}。若 put=2xx,去 iPhone/Mac 日历看 2026-07-18 有没有「ogenda D0 测试事件」,再跑 delete 命令清掉。`,
      );
    } catch (e) {
      console.error("[ogenda] write probe failed", e);
      new Notice("write probe 出错: " + (e as Error).message);
    }
  }

  async caldavDeleteProbe(): Promise<void> {
    const c = this.icloudCreds();
    if (!c || !this.settings.icloudCalUrl) {
      new Notice("先填 iCloud 凭据 + 日历 URL");
      return;
    }
    try {
      const del = await davRequest({ url: this.d0EventUrl(), method: "DELETE", ...c });
      console.log("[ogenda] DELETE status", del.status, "url", this.d0EventUrl());
      new Notice(`delete=${del.status}。去 iPhone/Mac 日历确认「ogenda D0 测试事件」已消失。`);
    } catch (e) {
      console.error("[ogenda] delete probe failed", e);
      new Notice("delete probe 出错: " + (e as Error).message);
    }
  }

  async loadSettings() {
    this.settings = sanitizeSettings(await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
