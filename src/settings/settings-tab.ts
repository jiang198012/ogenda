import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "../main";

export class OgendaSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Gmail address").addText((t) =>
      t.setValue(this.plugin.settings.email).onChange(async (v) => {
        this.plugin.settings.email = v.trim();
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("Gmail App 专用密码")
      .setDesc(
        "填一次即长期保存,不用再输。⚠️ 明文存于 data.json —— 请勿把此 vault 同步/备份到云端;不用时可在 Google 撤销该 App 密码。(空格会自动去除)",
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.appPassword).onChange(async (v) => {
          this.plugin.settings.appPassword = v.replace(/\s+/g, "");
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl).setName("Storage folder").addText((t) =>
      t.setValue(this.plugin.settings.storageFolder).onChange(async (v) => {
        this.plugin.settings.storageFolder = v.trim() || "Agenda";
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("Scan recent messages")
      .setDesc("扫描 INBOX 最近多少封邮件找日历邀请")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.scanCount)).onChange(async (v) => {
          const n = parseInt(v, 10);
          this.plugin.settings.scanCount = Number.isFinite(n) && n > 0 ? n : 50;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Sync on startup")
      .setDesc("启动 Obsidian 时自动同步一次")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        })
      );

    // --- iCloud CalDAV (D0 spike) ---
    containerEl.createEl("h3", { text: "iCloud CalDAV (D0 探针)" });

    new Setting(containerEl).setName("iCloud 邮箱 (Apple ID)").addText((t) =>
      t.setValue(this.plugin.settings.icloudUser).onChange(async (v) => {
        this.plugin.settings.icloudUser = v.trim();
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("iCloud App 专用密码")
      .setDesc("appleid.apple.com 生成的 16 位;明文存 data.json;空格自动去除。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.icloudAppPassword).onChange(async (v) => {
          this.plugin.settings.icloudAppPassword = v.replace(/\s+/g, "");
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("iCloud 日历 URL")
      .setDesc("D0.2 用:先跑 discovery 探针,从控制台复制某个日历的 href 粘这里。")
      .addText((t) =>
        t.setValue(this.plugin.settings.icloudCalUrl).onChange(async (v) => {
          this.plugin.settings.icloudCalUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );
  }
}
