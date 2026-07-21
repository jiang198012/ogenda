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
  shouldSaveOnEnter,
} from "./event-form-fields";
import { t } from "../i18n";
import { categoryColorFor } from "./colors";
import { getPredefinedCategories } from "./event-form-fields";

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
    private defaultCategory: string,
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
      end: existing ? (existing.end ?? "") : defaultEndFor(start, allDay),
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      category: existing?.category ?? defaultCategory,
      description: existing?.description ?? "",
    };
  }

  onOpen(): void {
    this.setTitle(t(this.existing ? "form.titleEdit" : "form.titleNew"));
    const { contentEl } = this;

    const titleSetting = new Setting(contentEl).setName(t("form.title.name") + " *").addText((tx) => {
      this.titleInput = tx.inputEl;
      tx.setValue(this.fields.title).onChange((v) => {
        this.fields.title = v;
        this.updateValidity();
      });
    });
    titleSetting.settingEl.addClass("ogenda-form-title");

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
    const catChips = catRow.controlEl.createDiv({ cls: "ogenda-form-cat-chips" });
    const catInput = catRow.controlEl.createEl("input", { type: "text", cls: "ogenda-form-cat-input" });

    const predefined = getPredefinedCategories();
    const renderChips = () => {
      catChips.empty();
      for (const { value: c } of predefined) {
        const chip = catChips.createDiv({ cls: "ogenda-form-cat-chip", text: c });
        chip.style.borderLeftColor = categoryColorFor(c);
        if (this.fields.category === c) chip.addClass("active");
        chip.addEventListener("click", () => {
          this.fields.category = c;
          catInput.value = c;
          renderChips();
        });
      }
    };
    catInput.value = this.fields.category;
    catInput.addEventListener("input", () => {
      this.fields.category = catInput.value;
      renderChips();
    });
    renderChips();

    const descSetting = new Setting(contentEl).setName(t("form.description.name")).addTextArea((tx) => {
      tx.setValue(this.fields.description).onChange((v) => (this.fields.description = v));
      tx.inputEl.addClass("ogenda-form-desc");
    });
    descSetting.settingEl.addClass("ogenda-form-desc-row");

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

    const setAdvanced = (open: boolean) => {
      advanced.style.display = open ? "" : "none";
      moreToggle.setText((open ? "▾ " : "▸ ") + t("form.moreOptions"));
    };
    // Edit and New open identically: advanced section collapsed by default in both.
    setAdvanced(false);
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
      if (shouldSaveOnEnter(e.key, e.isComposing, e.target instanceof HTMLTextAreaElement, this.saveBtn.disabled)) {
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
