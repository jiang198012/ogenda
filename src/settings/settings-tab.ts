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
    const s = this.plugin.settings;
    containerEl.empty();

    // Language
    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) => {
        d.addOption("auto", t("settings.language.auto"));
        d.addOption("zh", "简体中文");
        d.addOption("en", "English");
        d.setValue(s.language);
        d.onChange(async (v) => {
          s.language = v as "auto" | "zh" | "en";
          await this.plugin.saveSettings();
          setLanguage(resolveLanguage(s.language, getObsidianLocale()));
          this.display();
          this.plugin.refreshOpenPanels();
        });
      });

    // Calendar sync
    containerEl.createEl("h3", { text: t("settings.sync.section") });
    new Setting(containerEl)
      .setName(t("settings.sync.provider.name"))
      .setDesc(t("settings.sync.provider.desc"))
      .addDropdown((d) => {
        d.addOption("none", t("settings.sync.provider.none"));
        d.addOption("icloud", t("settings.sync.provider.icloud"));
        d.addOption("caldav", t("settings.sync.provider.caldav"));
        d.addOption("ics", t("settings.sync.provider.ics"));
        d.setValue(s.syncProvider);
        d.onChange(async (v) => {
          s.syncProvider = v as typeof s.syncProvider;
          await this.plugin.saveSettings();
          this.display(); // re-render to show only the selected provider's fields
        });
      });

    if (s.syncProvider === "icloud") {
      new Setting(containerEl).setName(t("settings.icloud.user.name")).addText((x) =>
        x.setValue(s.icloudUser).onChange(async (v) => { s.icloudUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.icloud.appPassword.name")).setDesc(t("settings.icloud.appPassword.desc")).addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.icloudAppPassword).onChange(async (v) => { s.icloudAppPassword = v.trim(); await this.plugin.saveSettings(); });
      });
      new Setting(containerEl).setName(t("settings.icloud.calUrl.name")).setDesc(t("settings.icloud.calUrl.desc")).addText((x) =>
        x.setValue(s.icloudCalUrl).onChange(async (v) => { s.icloudCalUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
    } else if (s.syncProvider === "caldav") {
      new Setting(containerEl).setName(t("settings.caldav.url.name")).addText((x) =>
        x.setValue(s.caldavUrl).onChange(async (v) => { s.caldavUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.caldav.user.name")).addText((x) =>
        x.setValue(s.caldavUser).onChange(async (v) => { s.caldavUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.caldav.pass.name")).setDesc(t("settings.caldav.pass.desc")).addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.caldavPass).onChange(async (v) => { s.caldavPass = v.trim(); await this.plugin.saveSettings(); });
      });
    } else if (s.syncProvider === "ics") {
      new Setting(containerEl).setName(t("settings.ics.url.name")).setDesc(t("settings.ics.url.desc")).addText((x) =>
        x.setValue(s.icsUrl).onChange(async (v) => { s.icsUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
    }

    new Setting(containerEl)
      .setName(t("settings.sync.startup.name"))
      .setDesc(t("settings.sync.startup.desc"))
      .addToggle((tg) =>
        tg.setValue(s.syncOnStartup).onChange(async (v) => { s.syncOnStartup = v; await this.plugin.saveSettings(); }),
      );

    // Storage
    containerEl.createEl("h3", { text: t("settings.storage.section") });
    new Setting(containerEl).setName(t("settings.storage.folder.name")).addText((x) =>
      x.setValue(s.storageFolder).onChange(async (v) => { s.storageFolder = v.trim() || "Agenda"; await this.plugin.saveSettings(); }),
    );
    new Setting(containerEl)
      .setName(t("settings.tz.name"))
      .setDesc(t("settings.tz.desc"))
      .addDropdown((d) => {
        d.addOption("", t("settings.tz.followSystem"));
        for (const opt of buildTimezoneOptions()) d.addOption(opt.iana, opt.label);
        d.setValue(s.timezone);
        d.onChange(async (v) => { s.timezone = v; await this.plugin.saveSettings(); });
      });
  }
}
