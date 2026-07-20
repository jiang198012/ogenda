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
  shiftEndWithStart,
  defaultEndFor,
  RSVP_OPTIONS,
} from "./event-form-fields";
import { t } from "../i18n";

export class EventFormModal extends Modal {
  private fields: RawFormFields;
  private errorEl: HTMLElement | null = null;
  private startInput!: HTMLInputElement;
  private endInput!: HTMLInputElement;
  private titleInput!: HTMLInputElement;
  private saveBtn!: HTMLButtonElement;

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
    const allDay = existing?.allDay ?? defaultAllDay;
    const start = existing?.start ?? initialStart(prefillStart ?? "", allDay);
    this.fields = {
      title: existing?.title ?? "",
      start,
      end: existing?.end ?? defaultEndFor(start, allDay),
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      category: existing?.category ?? "",
      tags: existing?.tags?.join(", ") ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(t(this.existing ? "form.titleEdit" : "form.titleNew"));
    const { contentEl } = this;

    new Setting(contentEl).setName(t("form.title.name") + " *").addText((tx) => {
      this.titleInput = tx.inputEl;
      tx.setValue(this.fields.title).onChange((v) => {
        this.fields.title = v;
        this.updateValidity();
      });
    });

    new Setting(contentEl).setName(t("form.allDay.name")).addToggle((tg) =>
      tg.setValue(this.fields.allDay).onChange((v) => {
        this.fields.start = this.readDateInput(this.startInput);
        this.fields.end = this.readDateInput(this.endInput);
        this.fields.allDay = v;
        this.applyDateInputs();
        this.updateValidity();
      }),
    );

    const startRow = new Setting(contentEl).setName(t("form.start.name") + " *");
    this.startInput = startRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    const endRow = new Setting(contentEl).setName(t("form.end.name")).setDesc(t("form.end.desc"));
    this.endInput = endRow.controlEl.createEl("input", { cls: "ogenda-form-datetime" });
    this.applyDateInputs();
    this.startInput.addEventListener("change", () => {
      const newStart = this.readDateInput(this.startInput);
      this.fields.end = shiftEndWithStart(this.fields.start, this.readDateInput(this.endInput), newStart);
      this.fields.start = newStart;
      this.applyDateInputs();
      this.updateValidity();
    });
    this.endInput.addEventListener("change", () => {
      this.fields.end = this.readDateInput(this.endInput);
      this.updateValidity();
    });

    new Setting(contentEl).setName(t("form.location.name")).addText((tx) =>
      tx.setValue(this.fields.location).onChange((v) => (this.fields.location = v)),
    );

    const catRow = new Setting(contentEl).setName(t("form.category.name")).setDesc(t("form.category.desc"));
    const catInput = catRow.controlEl.createEl("input", { type: "text" });
    catInput.value = this.fields.category;
    const dl = catRow.controlEl.createEl("datalist");
    dl.id = "ogenda-cat-list";
    for (const c of this.existingCategories) dl.createEl("option", { value: c });
    catInput.setAttr("list", "ogenda-cat-list");
    catInput.addEventListener("input", () => (this.fields.category = catInput.value));

    new Setting(contentEl)
      .setName(t("form.tags.name"))
      .setDesc(t("form.commaSeparated"))
      .addText((tx) => tx.setValue(this.fields.tags).onChange((v) => (this.fields.tags = v)));

    const moreToggle = contentEl.createDiv({ cls: "ogenda-form-more-toggle" });
    const advanced = contentEl.createDiv({ cls: "ogenda-form-advanced" });

    new Setting(advanced).setName(t("form.organizer.name")).addText((tx) =>
      tx.setValue(this.fields.organizer).onChange((v) => (this.fields.organizer = v)),
    );
    new Setting(advanced)
      .setName(t("form.attendees.name"))
      .setDesc(t("form.commaSeparated"))
      .addText((tx) => tx.setValue(this.fields.attendees).onChange((v) => (this.fields.attendees = v)));
    new Setting(advanced).setName(t("form.status.name")).addDropdown((d) =>
      d
        .addOption("", t("form.status.unset"))
        .addOption("confirmed", t("status.confirmed"))
        .addOption("tentative", t("status.tentative"))
        .addOption("cancelled", t("status.cancelled"))
        .setValue(this.fields.status)
        .onChange((v) => (this.fields.status = v)),
    );
    new Setting(advanced).setName(t("rsvp.name")).addDropdown((d) => {
      d.addOption("", t("form.status.unset"));
      for (const opt of RSVP_OPTIONS) d.addOption(opt.value, t(opt.labelKey));
      const cur = this.fields.rsvp.trim();
      if (cur && !RSVP_OPTIONS.some((o) => o.value === cur)) d.addOption(cur, t("rsvp.currentValue", { value: cur }));
      d.setValue(this.fields.rsvp).onChange((v) => (this.fields.rsvp = v));
    });

    const advHasValue = !!(this.fields.organizer || this.fields.attendees || this.fields.status || this.fields.rsvp);
    const setAdvanced = (open: boolean) => {
      advanced.style.display = open ? "" : "none";
      moreToggle.setText((open ? "▾ " : "▸ ") + t("form.moreOptions"));
    };
    setAdvanced(advHasValue);
    moreToggle.addEventListener("click", () => setAdvanced(advanced.style.display === "none"));

    this.errorEl = contentEl.createDiv({ cls: "ogenda-form-error" });

    const buttonRow = contentEl.createDiv({ cls: "ogenda-form-buttons" });
    if (this.existing && this.onViewInNote) {
      const viewBtn = buttonRow.createEl("button", { text: t("form.viewInNote") });
      viewBtn.addEventListener("click", () => {
        this.close();
        this.onViewInNote!();
      });
    }
    if (this.existing && this.onDelete) {
      const delBtn = buttonRow.createEl("button", { text: t("form.delete") });
      delBtn.addEventListener("click", () => {
        this.close();
        this.onDelete!();
      });
    }
    this.saveBtn = buttonRow.createEl("button", { text: t("form.save"), cls: "mod-cta" });
    this.saveBtn.addEventListener("click", () => this.handleSave());

    this.updateValidity();
    this.titleInput.focus();
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !this.saveBtn.disabled) {
        e.preventDefault();
        this.handleSave();
      }
    });
  }

  private updateValidity(): void {
    const result = validateEventForm({
      title: this.fields.title,
      start: this.readDateInput(this.startInput),
      end: this.readDateInput(this.endInput),
      allDay: this.fields.allDay,
    });
    if (this.errorEl) this.errorEl.setText(result.valid ? "" : result.errors.join("; "));
    if (this.saveBtn) this.saveBtn.disabled = !result.valid;
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
