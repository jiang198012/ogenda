import { Plugin, Notice } from "obsidian";
import { OgendaSettings, sanitizeSettings } from "./settings/settings";
import { OgendaSettingTab } from "./settings/settings-tab";
import { decryptSecret } from "./settings/secret-store";
import { promptPassphrase } from "./ui/passphrase-modal";
import { ObsidianFileStore } from "./store/obsidian-file-store";
import { MonthlyStore } from "./store/monthly-store";
import { GmailImapConnector } from "./connectors/gmail-imap";
import { SyncService } from "./sync/sync-service";

export default class OgendaPlugin extends Plugin {
  settings!: OgendaSettings;
  appPassword = ""; // transient: the DECRYPTED app password, cached for this session only

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OgendaSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-sync-now",
      name: "Sync now",
      callback: () => void this.syncNow(),
    });

    if (this.settings.syncOnStartup && this.settings.encryptedPassword) {
      this.app.workspace.onLayoutReady(() => void this.syncNow());
    }
  }

  /** Returns the decrypted app password, prompting for the passphrase once per session. */
  private async ensureAppPassword(): Promise<string | null> {
    if (this.appPassword) return this.appPassword;
    if (!this.settings.encryptedPassword) {
      new Notice("请先在 ogenda 设置里「加密保存」App 密码");
      return null;
    }
    const pass = await promptPassphrase(this.app, "输入 ogenda 解锁口令");
    if (pass == null || pass === "") return null;
    try {
      this.appPassword = decryptSecret(this.settings.encryptedPassword, pass);
      return this.appPassword;
    } catch {
      new Notice("口令错误,解密失败");
      return null;
    }
  }

  async syncNow(): Promise<void> {
    if (!this.settings.email) {
      new Notice("请先在 ogenda 设置里填 Gmail 地址");
      return;
    }
    const pw = await this.ensureAppPassword();
    if (!pw) return;
    const store = new MonthlyStore(new ObsidianFileStore(this.app.vault), this.settings.storageFolder);
    const connector = new GmailImapConnector(
      { email: this.settings.email, appPassword: pw },
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

  async loadSettings() {
    const raw = await this.loadData();
    this.settings = sanitizeSettings(raw);
    // scrub any PLAINTEXT secret persisted by an earlier build from data.json
    if (raw && typeof raw === "object" && "appPassword" in (raw as object)) {
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
