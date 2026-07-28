import { App, Notice, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type OgendaPlugin from "../main";
import { buildTimezoneOptions } from "./timezone-options";
import { t, setLanguage, resolveLanguage } from "../i18n";
import { getDefaultCategory, getPredefinedCategories } from "../agenda-panel/event-form-fields";
import type { DiscoveredCalendar } from "../connectors/caldav/parse-calendar-list";

export function getObsidianLocale(): string {
  return window.localStorage.getItem("language") ?? "en";
}

/** Dropdown label; same-named calendars get their id appended so they stay tellable apart. */
function calendarLabel(cal: DiscoveredCalendar, all: DiscoveredCalendar[]): string {
  if (all.filter((o) => o.name === cal.name).length < 2) return cal.name;
  const id = cal.url.replace(/\/$/, "").split("/").pop() ?? cal.url;
  return `${cal.name} (${id})`;
}

/** Adds an eye button that toggles the field between hidden and readable. */
function addPasswordToggle(setting: Setting, input: HTMLInputElement): void {
  setting.addExtraButton((b) => {
    const render = () => {
      const hidden = input.type === "password";
      b.setIcon(hidden ? "eye" : "eye-off");
      b.setTooltip(hidden ? t("settings.password.show") : t("settings.password.hide"));
    };
    render();
    b.onClick(() => {
      input.type = input.type === "password" ? "text" : "password";
      render();
    });
  });
}

export class OgendaSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  /** Calendars from the last discovery run; kept across re-renders, cleared when the provider changes. */
  private discovered: DiscoveredCalendar[] = [];
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  private async fetchCalendars(): Promise<void> {
    new Notice(t("notice.discoveryFetching"));
    try {
      this.discovered = await this.plugin.caldavListCalendars();
      new Notice(
        this.discovered.length
          ? t("notice.discoveryDone", { count: this.discovered.length })
          : t("notice.discoveryEmpty"),
      );
      this.display();
    } catch (e) {
      // 10s like the sync errors: the default 5s is easy to miss, and this one
      // carries the HTTP status the user needs to tell a wrong password apart
      // from a network problem.
      new Notice(t("notice.discoveryError", { msg: (e as Error).message }), 10000);
      console.error("[ogenda] calendar discovery failed", e);
    }
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

    // Category
    new Setting(containerEl).setName(t("settings.category.section")).setHeading();
    const currentDefault = s.defaultCategory || getDefaultCategory();
    const catOptions = getPredefinedCategories();
    const isPredefined = catOptions.some((o) => o.value === currentDefault);
    let catText: TextComponent | undefined;
    const catSetting = new Setting(containerEl)
      .setName(t("settings.category.default.name"))
      .setDesc(t("settings.category.default.desc"));
    catSetting.addDropdown((d) => {
      d.addOption("", t("form.category.custom"));
      for (const opt of catOptions) d.addOption(opt.value, opt.label);
      d.setValue(isPredefined ? currentDefault : "");
      d.onChange(async (v) => {
        if (v && catText) catText.setValue(v);
        s.defaultCategory = (v || catText?.getValue() || "").trim();
        await this.plugin.saveSettings();
      });
    });
    catSetting.addText((x) => {
      catText = x;
      x.setValue(currentDefault).onChange(async (v) => {
        s.defaultCategory = v.trim();
        await this.plugin.saveSettings();
      });
    });

    // Calendar sync
    new Setting(containerEl).setName(t("settings.sync.section")).setHeading();
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
          this.discovered = [];
          await this.plugin.saveSettings();
          this.display(); // re-render to show only the selected provider's fields
        });
      });

    if (s.syncProvider === "icloud") {
      new Setting(containerEl).setName(t("settings.icloud.user.name")).addText((x) =>
        x.setValue(s.icloudUser).onChange(async (v) => { s.icloudUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      const pwSetting = new Setting(containerEl)
        .setName(t("settings.icloud.appPassword.name"))
        .setDesc(t("settings.icloud.appPassword.desc"));
      pwSetting.addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.icloudAppPassword).onChange(async (v) => { s.icloudAppPassword = v.trim(); await this.plugin.saveSettings(); });
        addPasswordToggle(pwSetting, x.inputEl);
      });

      const calSetting = new Setting(containerEl)
        .setName(t("settings.icloud.calUrl.name"))
        .setDesc(t("settings.icloud.calUrl.desc"));
      let calUrlText: TextComponent | undefined;
      calSetting.addText((x) => {
        calUrlText = x;
        x.setValue(s.icloudCalUrl).onChange(async (v) => { s.icloudCalUrl = v.trim(); await this.plugin.saveSettings(); });
      });
      calSetting.addExtraButton((b) =>
        b.setIcon("search").setTooltip(t("settings.icloud.calUrl.fetch")).onClick(() => void this.fetchCalendars()),
      );
      if (this.discovered.length) {
        new Setting(containerEl).setName(t("settings.icloud.calUrl.pick.name")).addDropdown((d) => {
          d.addOption("", t("settings.icloud.calUrl.pick.placeholder"));
          for (const c of this.discovered) d.addOption(c.url, calendarLabel(c, this.discovered));
          d.setValue(this.discovered.some((c) => c.url === s.icloudCalUrl) ? s.icloudCalUrl : "");
          d.onChange(async (v) => {
            if (!v) return;
            s.icloudCalUrl = v;
            calUrlText?.setValue(v); // update the field in place; a full re-render would drop focus
            await this.plugin.saveSettings();
          });
        });
      }
    } else if (s.syncProvider === "caldav") {
      new Setting(containerEl).setName(t("settings.caldav.url.name")).addText((x) =>
        x.setValue(s.caldavUrl).onChange(async (v) => { s.caldavUrl = v.trim(); await this.plugin.saveSettings(); }),
      );
      new Setting(containerEl).setName(t("settings.caldav.user.name")).addText((x) =>
        x.setValue(s.caldavUser).onChange(async (v) => { s.caldavUser = v.trim(); await this.plugin.saveSettings(); }),
      );
      const davPwSetting = new Setting(containerEl)
        .setName(t("settings.caldav.pass.name"))
        .setDesc(t("settings.caldav.pass.desc"));
      davPwSetting.addText((x) => {
        x.inputEl.type = "password";
        x.setValue(s.caldavPass).onChange(async (v) => { s.caldavPass = v.trim(); await this.plugin.saveSettings(); });
        addPasswordToggle(davPwSetting, x.inputEl);
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
    new Setting(containerEl).setName(t("settings.storage.section")).setHeading();
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
