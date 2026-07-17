import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, OgendaSettings } from "./settings/settings";
import { OgendaSettingTab } from "./settings/settings-tab";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { GmailImapConnector } from "./connectors/gmail-imap";
import { SyncService } from "./sync/sync-service";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;
  appPassword = ""; // transient, in-memory only — NEVER persisted to data.json

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-sync-now",
      name: "Sync now",
      callback: () => void this.syncNow(),
    });

    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.syncNow());
    }
  }

  private buildSyncService(): SyncService | null {
    if (!this.settings.email || !this.appPassword) {
      new Notice("请先在 ogenda 设置里填 Gmail 地址 + App 密码(本会话)");
      return null;
    }
    const store = new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
    const connector = new GmailImapConnector(
      { email: this.settings.email, appPassword: this.appPassword },
      this.settings.scanCount,
    );
    return new SyncService([connector], store, (m) => new Notice(m));
  }

  async syncNow(): Promise<void> {
    const svc = this.buildSyncService();
    if (!svc) return;
    try {
      await svc.syncNow();
    } catch (e) {
      new Notice("同步出错: " + (e as Error).message);
      console.error("[ogenda] syncNow error", e);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
