import { Plugin, Notice } from "obsidian";
import { DEFAULT_SETTINGS, SpikeSettings, SpikeSettingTab } from "./spike-settings";
import { imapConnectTest, dumpOneInvite } from "./imap-spike";

export default class OgendaPlugin extends Plugin {
  settings!: SpikeSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SpikeSettingTab(this.app, this));

    this.addCommand({
      id: "ogenda-hello",
      name: "Hello (build check)",
      callback: () => new Notice("ogenda loaded ✔"),
    });
    this.addCommand({
      id: "ogenda-imap-connect-test",
      name: "IMAP connect test",
      callback: () => void imapConnectTest(this.settings),
    });
    this.addCommand({
      id: "ogenda-dump-invite",
      name: "Dump one invite ICS",
      callback: () => void dumpOneInvite(this.settings),
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
