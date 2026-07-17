import { App, Modal, Setting } from "obsidian";

/** Opens a modal asking for a passphrase. Resolves the entered value, or null if cancelled. */
export function promptPassphrase(app: App, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    let submitted = false;
    const modal = new (class extends Modal {
      onOpen() {
        this.titleEl.setText(title);
        let value = "";
        const finish = () => {
          submitted = true;
          resolve(value);
          this.close();
        };
        new Setting(this.contentEl).setName("解锁口令").addText((t) => {
          t.inputEl.type = "password";
          t.onChange((v) => (value = v));
          t.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") finish();
          });
          window.setTimeout(() => t.inputEl.focus(), 0);
        });
        new Setting(this.contentEl).addButton((b) =>
          b.setButtonText("解锁").setCta().onClick(finish),
        );
      }
      onClose() {
        this.contentEl.empty();
        if (!submitted) resolve(null);
      }
    })(app);
    modal.open();
  });
}
