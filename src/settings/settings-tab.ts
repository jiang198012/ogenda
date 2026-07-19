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

    new Setting(containerEl).setName("Gmail address").addText((t) =>
      t.setValue(this.plugin.settings.email).onChange(async (v) => {
        this.plugin.settings.email = v.trim();
        await this.plugin.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName("Gmail App 专用密码")
      .setDesc(
        "照抄 Google 给的原样(含空格/横杠,不用改格式)。填一次长期保存。⚠️ 明文存于 data.json —— 勿把此 vault 同步/备份到云端;不用时可在 Google 撤销。",
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.appPassword).onChange(async (v) => {
          this.plugin.settings.appPassword = v.trim();
          await this.plugin.saveSettings();
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

    containerEl.createEl("h3", { text: "分类颜色(可选覆盖)" });
    const catWrap = containerEl.createDiv();
    this.renderCategoryColors(catWrap);

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

  private renderCategoryColors(wrap: HTMLElement): void {
    wrap.empty();
    const colors = this.plugin.settings.categoryColors;
    for (const name of Object.keys(colors)) {
      const row = new Setting(wrap).setName(name);
      row.addColorPicker((cp) =>
        cp.setValue(colors[name]).onChange(async (v) => {
          this.plugin.settings.categoryColors[name] = v;
          await this.plugin.saveSettings();
        }),
      );
      row.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("移除此覆盖")
          .onClick(async () => {
            delete this.plugin.settings.categoryColors[name];
            await this.plugin.saveSettings();
            this.renderCategoryColors(wrap);
          }),
      );
    }
    let newName = "";
    const addRow = new Setting(wrap).setName("新增覆盖").setDesc("填分类名后点添加(默认蓝,可再改)");
    addRow.addText((t) => t.setPlaceholder("分类名").onChange((v) => (newName = v.trim())));
    addRow.addButton((b) =>
      b.setButtonText("添加").onClick(async () => {
        if (!newName || this.plugin.settings.categoryColors[newName]) return;
        this.plugin.settings.categoryColors[newName] = "#4c8dff";
        await this.plugin.saveSettings();
        this.renderCategoryColors(wrap);
      }),
    );
  }
}
