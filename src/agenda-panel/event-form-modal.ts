import { App, Modal, Setting } from "obsidian";
import { AgendaEvent } from "../core/event";
import { generateUid } from "./uid";
import {
  validateEventForm,
  buildEventFromFields,
  RawFormFields,
  initialStart,
  isoToDateValue,
  isoToDatetimeLocalValue,
  dateValueToIso,
  datetimeLocalValueToIso,
} from "./event-form-fields";

export class EventFormModal extends Modal {
  private fields: RawFormFields;
  private errorEl: HTMLElement | null = null;
  private startInput!: HTMLInputElement;
  private endInput!: HTMLInputElement;

  constructor(
    app: App,
    private existing: AgendaEvent | null,
    prefillStart: string | undefined,
    defaultAllDay: boolean,
    private existingCategories: string[],
    private onSubmit: (event: AgendaEvent) => void,
    private onViewInNote: (() => void) | undefined,
    private onDelete: (() => void) | undefined,
  ) {
    super(app);
    const isKnownCategory = existing?.category !== undefined && existingCategories.includes(existing.category);
    const allDay = existing?.allDay ?? defaultAllDay;
    this.fields = {
      title: existing?.title ?? "",
      start: existing?.start ?? initialStart(prefillStart ?? "", allDay),
      end: existing?.end ?? "",
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      categoryDropdown: isKnownCategory ? existing!.category! : "",
      categoryText: existing?.category && !isKnownCategory ? existing.category : "",
      tags: existing?.tags?.join(", ") ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(this.existing ? "编辑事件" : "新建事件");
    const { contentEl } = this;

    new Setting(contentEl).setName("标题").addText((t) =>
      t.setValue(this.fields.title).onChange((v) => (this.fields.title = v)),
    );
    new Setting(contentEl).setName("全天").addToggle((tg) =>
      tg.setValue(this.fields.allDay).onChange((v) => {
        // Preserve entered values across the input-type switch (read with the OLD allDay first).
        this.fields.start = this.readDateInput(this.startInput);
        this.fields.end = this.readDateInput(this.endInput);
        this.fields.allDay = v;
        this.applyDateInputs();
      }),
    );

    const startRow = new Setting(contentEl).setName("开始时间");
    this.startInput = startRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    const endRow = new Setting(contentEl).setName("结束时间").setDesc("可留空(全天填次日,排他)");
    this.endInput = endRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    this.applyDateInputs();
    this.startInput.addEventListener("change", () => (this.fields.start = this.readDateInput(this.startInput)));
    this.endInput.addEventListener("change", () => (this.fields.end = this.readDateInput(this.endInput)));

    new Setting(contentEl).setName("地点").addText((t) =>
      t.setValue(this.fields.location).onChange((v) => (this.fields.location = v)),
    );
    new Setting(contentEl).setName("组织者").addText((t) =>
      t.setValue(this.fields.organizer).onChange((v) => (this.fields.organizer = v)),
    );
    new Setting(contentEl)
      .setName("参与人")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.attendees).onChange((v) => (this.fields.attendees = v)));
    new Setting(contentEl).setName("状态").addDropdown((d) =>
      d
        .addOption("", "(未设置)")
        .addOption("confirmed", "confirmed")
        .addOption("tentative", "tentative")
        .addOption("cancelled", "cancelled")
        .setValue(this.fields.status)
        .onChange((v) => (this.fields.status = v)),
    );
    new Setting(contentEl).setName("RSVP").addText((t) =>
      t.setValue(this.fields.rsvp).onChange((v) => (this.fields.rsvp = v)),
    );
    new Setting(contentEl)
      .setName("分类")
      .setDesc("下拉选已有分类")
      .addDropdown((d) => {
        d.addOption("", "(未设置)");
        for (const c of this.existingCategories) d.addOption(c, c);
        d.setValue(this.fields.categoryDropdown);
        d.onChange((v) => (this.fields.categoryDropdown = v));
      });
    new Setting(contentEl)
      .setName("新分类")
      .setDesc("可选,填了就优先用这个而不是上面的下拉选择")
      .addText((t) => t.setValue(this.fields.categoryText).onChange((v) => (this.fields.categoryText = v)));
    new Setting(contentEl)
      .setName("标签")
      .setDesc("多个用逗号分隔")
      .addText((t) => t.setValue(this.fields.tags).onChange((v) => (this.fields.tags = v)));

    this.errorEl = contentEl.createDiv({ cls: "ogenda-form-error" });

    const buttonRow = contentEl.createDiv({ cls: "ogenda-form-buttons" });
    if (this.existing && this.onViewInNote) {
      const viewBtn = buttonRow.createEl("button", { text: "在笔记中查看" });
      viewBtn.addEventListener("click", () => {
        this.close();
        this.onViewInNote!();
      });
    }
    if (this.existing && this.onDelete) {
      const delBtn = buttonRow.createEl("button", { text: "删除" });
      delBtn.addEventListener("click", () => {
        this.close();
        this.onDelete!();
      });
    }
    const saveBtn = buttonRow.createEl("button", { text: "保存", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => this.handleSave());
  }

  private applyDateInputs(): void {
    if (this.fields.allDay) {
      this.startInput.type = "date";
      this.endInput.type = "date";
      this.startInput.value = isoToDateValue(this.fields.start);
      this.endInput.value = this.fields.end ? isoToDateValue(this.fields.end) : "";
    } else {
      this.startInput.type = "datetime-local";
      this.endInput.type = "datetime-local";
      this.startInput.value = isoToDatetimeLocalValue(this.fields.start);
      this.endInput.value = this.fields.end ? isoToDatetimeLocalValue(this.fields.end) : "";
    }
  }

  private readDateInput(input: HTMLInputElement): string {
    const v = input.value;
    if (!v) return "";
    return this.fields.allDay ? dateValueToIso(v) : datetimeLocalValueToIso(v);
  }

  private handleSave(): void {
    this.fields.start = this.readDateInput(this.startInput);
    this.fields.end = this.readDateInput(this.endInput);
    const result = validateEventForm(this.fields);
    if (!result.valid) {
      if (this.errorEl) this.errorEl.setText(result.errors.join("; "));
      return;
    }
    const event = buildEventFromFields(this.fields, this.existing, generateUid);
    this.close();
    this.onSubmit(event);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
