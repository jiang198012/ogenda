// 重复事件的「仅本次 / 全部 / 删除本次」选择弹窗。
// 点开重复事件的某个实例时出现;拖动/改时间也走这里。
import { App, Modal } from "obsidian";
import { EventOccurrence } from "./occurrences";
import { t } from "../i18n";

export type RecurrenceChoice =
  | "thisOccurrence"
  | "deleteThisOccurrence"
  | "all";

export class RecurrenceChoiceModal extends Modal {
  constructor(
    app: App,
    private occ: EventOccurrence,
    private onChoice: (choice: RecurrenceChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(t("recur.title"));
    contentEl.createEl("p", { cls: "ogenda-recur-desc", text: t("recur.desc", { title: this.occ.event.title }) });

    const row = contentEl.createDiv({ cls: "ogenda-form-buttons ogenda-recur-buttons" });
    const btn = (label: string, cb: () => void, cls = "") => {
      const b = row.createEl("button", { text: label, cls });
      b.addEventListener("click", cb);
      return b;
    };
    btn(t("recur.this"), () => {
      this.close();
      this.onChoice("thisOccurrence");
    }, "mod-cta");
    btn(t("recur.deleteThis"), () => {
      this.close();
      this.onChoice("deleteThisOccurrence");
    }, "mod-warning");
    btn(t("recur.all"), () => {
      this.close();
      this.onChoice("all");
    });
    btn(t("common.cancel"), () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
