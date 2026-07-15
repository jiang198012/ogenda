import { Plugin, Notice } from "obsidian";

export default class OgendaPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "ogenda-hello",
      name: "Hello (build check)",
      callback: () => new Notice("ogenda loaded ✔"),
    });
  }
}
