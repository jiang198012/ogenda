import { App, Modal, Setting } from "obsidian";
import { AgendaEvent } from "../core/event";
import { generateUid } from "./uid";
import {
  validateEventForm,
  buildEventFromFields,
  RawFormFields,
  initialStart,
  isoToDateValue,
  isoToTimeValue,
  formatTimeTyping,
  normalizeTimeInput,
  isValidTimeValue,
  combineDateAndTime,
  dateValueToIso,
  withTimeFrom,
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
  private startDate!: HTMLInputElement;
  private startTime!: HTMLInputElement;
  private endDate!: HTMLInputElement;
  private endTime!: HTMLInputElement;
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
        const prevStart = this.fields.start;
        const prevEnd = this.fields.end;
        this.fields.start = this.readStartIso();
        this.fields.end = this.readEndIso();
        this.fields.allDay = v;
        if (!v) {
          // The date input only hands back a bare date, so put the clock time back.
          this.fields.start = withTimeFrom(this.fields.start, prevStart, "09:00:00");
          if (this.fields.end) {
            const oneHourOn = defaultEndFor(this.fields.start, false);
            this.fields.end = withTimeFrom(this.fields.end, prevEnd, oneHourOn.slice(11, 19) || "10:00:00");
          }
        }
        this.applyDateInputs();
        this.updateValidity();
      }),
    );

    const startRow = new Setting(contentEl).setName(t("form.start.name") + " *");
    this.startDate = startRow.controlEl.createEl("input", { type: "date", cls: "ogenda-form-date" });
    this.startTime = startRow.controlEl.createEl("input", {
      type: "text",
      cls: "ogenda-form-time",
      attr: { inputmode: "numeric", autocomplete: "off", placeholder: "HH:MM" },
    });
    const endRow = new Setting(contentEl).setName(t("form.end.name")).setDesc(t("form.end.desc"));
    this.endDate = endRow.controlEl.createEl("input", { type: "date", cls: "ogenda-form-date" });
    this.endTime = endRow.controlEl.createEl("input", {
      type: "text",
      cls: "ogenda-form-time",
      attr: { inputmode: "numeric", autocomplete: "off", placeholder: "HH:MM" },
    });
    this.applyDateInputs();

    // The date inputs and the clock-time inputs both commit a field value.
    this.startDate.addEventListener("change", () => this.commitStart());
    this.endDate.addEventListener("change", () => this.commitEnd());
    this.bindTimeField(this.startTime, true);
    this.bindTimeField(this.endTime, false);

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

  /** Live-format the 24-hour clock-time field while typing; normalize it on blur. */
  private bindTimeField(input: HTMLInputElement, isStart: boolean): void {
    input.addEventListener("input", () => {
      const f = formatTimeTyping(input.value);
      if (f !== input.value) {
        input.value = f;
        const end = input.value.length;
        try {
          input.setSelectionRange(end, end);
        } catch {
          // Not a text input; ignore.
        }
      }
    });
    input.addEventListener("blur", () => {
      input.value = normalizeTimeInput(input.value);
    });
    input.addEventListener("change", () => {
      if (isStart) this.commitStart();
      else this.commitEnd();
    });
  }

  private commitStart(): void {
    const newStart = this.readStartIso();
    this.fields.end = shiftEndWithStart(this.fields.start, this.readEndIso(), newStart);
    this.fields.start = newStart;
    this.applyDateInputs();
    this.updateValidity();
  }

  private commitEnd(): void {
    this.fields.end = this.readEndIso();
    this.applyDateInputs();
    this.updateValidity();
  }

  private updateValidity(): void {
    const timeInvalid =
      !this.fields.allDay && this.startTime.value.trim() !== "" && !isValidTimeValue(normalizeTimeInput(this.startTime.value));
    const errors: string[] = [];
    if (timeInvalid) {
      errors.push(t("form.timeInvalid"));
    } else {
      const result = validateEventForm({
        title: this.fields.title,
        start: this.readStartIso(),
        end: this.readEndIso(),
        allDay: this.fields.allDay,
      });
      errors.push(...result.errors);
    }
    if (this.errorEl) this.errorEl.setText(errors.join("; "));
    if (this.saveBtn) this.saveBtn.disabled = errors.length > 0;
  }

  private applyDateInputs(): void {
    this.startDate.value = isoToDateValue(this.fields.start);
    this.endDate.value = this.fields.end ? isoToDateValue(this.fields.end) : "";
    if (!this.fields.allDay) {
      this.startTime.value = isoToTimeValue(this.fields.start);
      this.endTime.value = this.fields.end ? isoToTimeValue(this.fields.end) : "";
    }
    // The clock-time fields keep their value while hidden, so leaving all-day mode
    // can restore the time the user had typed.
    this.startTime.style.display = this.fields.allDay ? "none" : "";
    this.endTime.style.display = this.fields.allDay ? "none" : "";
  }

  private readStartIso(): string {
    if (this.fields.allDay) return dateValueToIso(this.startDate.value);
    return combineDateAndTime(this.startDate.value, this.startTime.value);
  }

  private readEndIso(): string {
    if (this.fields.allDay) return this.endDate.value ? dateValueToIso(this.endDate.value) : "";
    return combineDateAndTime(this.endDate.value, this.endTime.value);
  }

  private handleSave(): void {
    this.fields.start = this.readStartIso();
    this.fields.end = this.readEndIso();
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
