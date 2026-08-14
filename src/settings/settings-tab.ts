import { App, Notice, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type OgendaPlugin from "../main";
import { buildTimezoneOptions } from "./timezone-options";
import { t, setLanguage, resolveLanguage } from "../i18n";
import { getDefaultCategory, getPredefinedCategories, REMINDER_OPTIONS } from "../agenda-panel/event-form-fields";
import { TimeSegment, TIME_SEGMENT_COLORS } from "../agenda-panel/time-segments";
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

/**
 * 一条分区的编辑行:启用开关 + 名称 + 开始/结束(24h)+ 颜色 + 删除。
 * 任何改动都立即落盘并刷新面板;删除由调用方(能访问设置数组的闭包)执行。
 */
function segmentRow(
  seg: TimeSegment,
  onChanged: () => Promise<void>,
  onDelete: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "ogenda-segment-row";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = seg.enabled;
  toggle.className = "ogenda-segment-toggle";
  toggle.title = seg.enabled ? t("settings.segments.on") : t("settings.segments.off");
  toggle.addEventListener("change", () => {
    seg.enabled = toggle.checked;
    void onChanged();
  });
  row.appendChild(toggle);

  const name = document.createElement("input");
  name.type = "text";
  name.value = seg.name;
  name.placeholder = t("settings.segments.namePlaceholder");
  name.className = "ogenda-segment-name";
  name.addEventListener("change", () => {
    seg.name = name.value.trim();
    void onChanged();
  });
  row.appendChild(name);

  const start = document.createElement("input");
  start.type = "time";
  start.value = seg.start;
  start.className = "ogenda-segment-time";
  start.addEventListener("change", () => {
    seg.start = start.value || "00:00";
    void onChanged();
  });
  row.appendChild(start);

  const end = document.createElement("input");
  end.type = "time";
  end.value = seg.end === "24:00" ? "23:59" : seg.end;
  end.className = "ogenda-segment-time";
  end.addEventListener("change", () => {
    // type=time 没有 24:00;用户选 23:59 想表示"到午夜"时按原样存 23:59,
    // 想跨午夜(如 22:00–02:00)直接选结束时间即可。
    seg.end = end.value || "24:00";
    void onChanged();
  });
  row.appendChild(end);

  const color = document.createElement("input");
  color.type = "color";
  color.value = seg.color;
  color.className = "ogenda-segment-color";
  color.addEventListener("change", () => {
    seg.color = color.value;
    void onChanged();
  });
  row.appendChild(color);

  const del = document.createElement("button");
  del.textContent = t("settings.segments.delete");
  del.className = "ogenda-segment-del";
  del.addEventListener("click", () => {
    row.remove();
    onDelete();
  });
  row.appendChild(del);

  return row;
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

    // Reminders
    new Setting(containerEl).setName(t("settings.reminders.section")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.reminders.enabled.name"))
      .setDesc(t("settings.reminders.enabled.desc"))
      .addToggle((tg) =>
        tg.setValue(s.remindersEnabled).onChange(async (v) => { s.remindersEnabled = v; await this.plugin.saveSettings(); }),
      );
    new Setting(containerEl)
      .setName(t("settings.reminders.default.name"))
      .setDesc(t("settings.reminders.default.desc"))
      .addDropdown((d) => {
        for (const opt of REMINDER_OPTIONS) d.addOption(opt.value, t(opt.labelKey));
        // -1 = 不设置默认提醒(下拉显示「不提醒」,但事件本身不受影响)
        d.setValue(s.defaultReminderMinutes === -1 ? "" : String(s.defaultReminderMinutes));
        d.onChange(async (v) => {
          s.defaultReminderMinutes = v === "" ? -1 : Number(v);
          await this.plugin.saveSettings();
        });
      });

    // Time-line segments
    new Setting(containerEl).setName(t("settings.segments.section")).setHeading();
    new Setting(containerEl).setDesc(t("settings.segments.desc")).setName("");
    const segList = containerEl.createDiv({ cls: "ogenda-segments-list" });
    const renderSegments = () => {
      segList.empty();
      // 老用户升级后 sanitize 已注入默认 4 段;这里只管渲染。
      // 用户删光所有分区 → [] → 显示添加按钮,不再自动补回。
      s.timeSegments.forEach((seg) => {
        segList.appendChild(
          segmentRow(
            seg,
            async () => {
              await this.plugin.saveSettings();
              this.plugin.refreshOpenPanels();
            },
            () => {
              const idx = s.timeSegments.indexOf(seg);
              if (idx >= 0) s.timeSegments.splice(idx, 1);
              void this.plugin.saveSettings();
              renderSegments();
            },
          ),
        );
      });
      const addBtn = segList.createEl("button", { text: t("settings.segments.add"), cls: "ogenda-segments-add" });
      addBtn.addEventListener("click", () => {
        s.timeSegments.push({
          name: "",
          start: "09:00",
          end: "18:00",
          color: TIME_SEGMENT_COLORS[s.timeSegments.length % TIME_SEGMENT_COLORS.length],
          enabled: true,
        });
        void this.plugin.saveSettings();
        renderSegments();
      });
    };
    renderSegments();

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
