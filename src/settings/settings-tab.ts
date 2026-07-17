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
      .setName("App password (本会话内存,不落盘)")
      .setDesc("Gmail 16 位 App 专用密码;仅存内存,重启 Obsidian 后需重新输入。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.appPassword).onChange((v) => {
          this.plugin.appPassword = v.trim(); // transient — never persisted
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
      .setDesc("仅当本会话已输入 App 密码时生效(密钥不落盘,冷启动时为空)")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
