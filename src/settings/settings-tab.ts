import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "../main";
import { buildTimezoneOptions } from "./timezone-options";

export class OgendaSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Storage folder").addText((t) =>
      t.setValue(this.plugin.settings.storageFolder).onChange(async (v) => {
        this.plugin.settings.storageFolder = v.trim() || "Agenda";
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

    new Setting(containerEl)
      .setName("时区")
      .setDesc("面板\"今天\"等日期判断依据的时区。选\"跟随系统\"= 用电脑当前时区(默认行为)。")
      .addDropdown((d) => {
        d.addOption("", "跟随系统");
        for (const opt of buildTimezoneOptions()) {
          d.addOption(opt.iana, opt.label);
        }
        d.setValue(this.plugin.settings.timezone);
        d.onChange(async (v) => {
          this.plugin.settings.timezone = v;
          await this.plugin.saveSettings();
        });
      });

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
      .setDesc("appleid.apple.com 生成的,照抄原样(带横杠,别改格式);明文存 data.json。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.icloudAppPassword).onChange(async (v) => {
          this.plugin.settings.icloudAppPassword = v.trim();
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
