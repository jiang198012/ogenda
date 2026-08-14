// 快速新建弹窗:输入一句话 → 解析 → 用解析结果预填标准事件表单。
// 解析失败也照样打开表单(标题填原文),用户手动补时间,不阻塞输入流。
import { App, Modal, Notice } from "obsidian";
import { AgendaEvent } from "../core/event";
import { parseQuickAdd } from "./quick-add";
import { EventFormModal } from "./event-form-modal";
import { t } from "../i18n";

export class QuickAddModal extends Modal {
  constructor(
    app: App,
    private anchor: Date,
    private defaultCategory: string,
    private saveEvent: (event: AgendaEvent) => Promise<void>,
    private defaultReminderMinutes = -1,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t("quickadd.title"));
    const textarea = this.contentEl.createEl("textarea", {
      cls: "ogenda-quickadd-input",
      attr: { placeholder: t("quickadd.placeholder"), rows: "2" },
    });
    textarea.value = "";
    this.contentEl.createEl("p", { cls: "ogenda-quickadd-hint", text: t("quickadd.hint") });
    const err = this.contentEl.createDiv({ cls: "ogenda-form-error" });

    const submit = () => {
      const raw = textarea.value.trim();
      const parsed = raw ? parseQuickAdd(raw, this.anchor) : null;
      if (parsed && !parsed.ok) {
        err.setText(t("quickadd.parseError", { reason: t(parsed.reason) }));
        return;
      }
      this.close();
      new EventFormModal(
        this.app,
        null,
        parsed && parsed.ok ? parsed.start : undefined,
        false,
        this.defaultCategory,
        (created) => void this.saveEvent(created),
        undefined,
        undefined,
        this.defaultReminderMinutes,
        null,
        parsed && parsed.ok ? parsed.end : undefined,
        parsed && parsed.ok ? parsed.title : raw,
      ).open();
      if (!parsed) new Notice(t("quickadd.empty"), 6000);
    };
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    textarea.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
