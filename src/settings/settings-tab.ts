import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type OgendaPlugin from "../main";
import { encryptSecret } from "./secret-store";

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

    // --- Encrypted app password ---
    const saved = !!this.plugin.settings.encryptedPassword;
    const unlocked = !!this.plugin.appPassword;
    new Setting(containerEl)
      .setName("App 密码状态")
      .setDesc(
        saved
          ? unlocked
            ? "✓ 已加密保存,本会话已解锁"
            : "✓ 已加密保存(本会话未解锁,下次同步会弹口令)"
          : "未保存。请在下面填 App 密码 + 口令后点「加密保存」。",
      );

    let pendingPw = "";
    let pendingPass = "";
    new Setting(containerEl)
      .setName("Gmail App 专用密码")
      .setDesc("16 位 App 密码;加密后存盘,明文不落盘。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("xxxx xxxx xxxx xxxx").onChange((v) => (pendingPw = v.trim()));
      });
    new Setting(containerEl)
      .setName("加密口令")
      .setDesc("你自己设的口令,用来加密 App 密码;每次开 Obsidian 首次同步时输一次。")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("你的口令").onChange((v) => (pendingPass = v));
      });
    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("加密保存")
        .setCta()
        .onClick(async () => {
          if (!pendingPw || !pendingPass) {
            new Notice("请同时填写 App 密码和口令");
            return;
          }
          this.plugin.settings.encryptedPassword = encryptSecret(pendingPw, pendingPass);
          this.plugin.appPassword = pendingPw; // unlock this session
          await this.plugin.saveSettings();
          new Notice("已加密保存(明文不落盘)");
          this.display();
        }),
    );
    if (saved) {
      new Setting(containerEl).addButton((b) =>
        b
          .setButtonText("清除已保存的密码")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.encryptedPassword = null;
            this.plugin.appPassword = "";
            await this.plugin.saveSettings();
            new Notice("已清除");
            this.display();
          }),
      );
    }

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
      .setDesc("启动时自动同步(会在启动时弹口令解锁)")
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.syncOnStartup).onChange(async (v) => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
