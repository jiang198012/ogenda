import { App, PluginSettingTab, Setting } from "obsidian";
import type OgendaPlugin from "./main";

export interface SpikeSettings {
  email: string;
  appPassword: string;
}

export const DEFAULT_SETTINGS: SpikeSettings = { email: "", appPassword: "" };

export class SpikeSettingTab extends PluginSettingTab {
  plugin: OgendaPlugin;
  constructor(app: App, plugin: OgendaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ogenda spike (throwaway creds — 探针结束后删除)" });
    new Setting(containerEl).setName("Gmail address").addText((t) =>
      t.setValue(this.plugin.settings.email).onChange(async (v) => {
        this.plugin.settings.email = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new Setting(containerEl).setName("App password (16 chars)").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(this.plugin.settings.appPassword).onChange(async (v) => {
        this.plugin.settings.appPassword = v.trim();
        await this.plugin.saveSettings();
      });
    });
  }
}
