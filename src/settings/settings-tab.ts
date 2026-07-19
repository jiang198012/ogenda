import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "../main";
import { buildTimezoneOptions } from "./timezone-options";
import { t, setLanguage, resolveLanguage } from "../i18n";

export function getObsidianLocale(): string {
  return window.localStorage.getItem("language") ?? "en";
}

export class OgendaSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("auto", t("settings.language.auto"));
        d.addOption("zh", "简体中文");
        d.addOption("en", "English");
        d.setValue(this.plugin.settings.language);
        d.onChange(async (v) => {
          this.plugin.settings.language = v as "auto" | "zh" | "en";
          await this.plugin.saveSettings();
          setLanguage(resolveLanguage(this.plugin.settings.language, getObsidianLocale()));
          this.display(); // re-render settings in the new language
          this.plugin.refreshOpenPanels(); // re-render open agenda panels
        });
      });

    new Setting(containerEl).setName(t("settings.storage.folder.name")).addText((t) =>
      t.setValue(this.plugin.settings.storageFolder).onChange(async (v) => {
        this.plugin.settings.storageFolder = v.trim() || "Agenda";
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName(t("settings.sync.startup.name"))
      .setDesc(t("settings.sync.startup.desc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.tz.name"))
      .setDesc(t("settings.tz.desc"))
      .addDropdown((d) => {
        d.addOption("", t("settings.tz.followSystem"));
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
    containerEl.createEl("h3", { text: t("settings.icloud.section") });

    new Setting(containerEl).setName(t("settings.icloud.user.name")).addText((t) =>
      t.setValue(this.plugin.settings.icloudUser).onChange(async (v) => {
        this.plugin.settings.icloudUser = v.trim();
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName(t("settings.icloud.appPassword.name"))
      .setDesc(t("settings.icloud.appPassword.desc"))
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.icloudAppPassword).onChange(async (v) => {
          this.plugin.settings.icloudAppPassword = v.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.icloud.calUrl.name"))
      .setDesc(t("settings.icloud.calUrl.desc"))
      .addText((t) =>
        t.setValue(this.plugin.settings.icloudCalUrl).onChange(async (v) => {
          this.plugin.settings.icloudCalUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );
  }
}
