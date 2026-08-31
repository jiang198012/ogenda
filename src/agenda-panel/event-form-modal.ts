import { App, Modal, Setting } from "obsidian";
import { AgendaEvent, getReminderMinutes } from "../core/event";
import { generateUid } from "./uid";
import { EventOccurrence } from "./occurrences";
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
  REMINDER_OPTIONS,
  formatReminderInput,
  splitReminderInput,
  joinReminderInputs,
  shouldSaveOnEnter,
} from "./event-form-fields";
import { RRULE_PRESETS, presetForRrule, isValidRrule } from "./recurrence";
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
  private rruleCustomWrap: HTMLElement | null = null;
  private rruleCustomInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    private existing: AgendaEvent | null,
    prefillStart: string | undefined,
    defaultAllDay: boolean,
    private defaultCategory: string,
    private onSubmit: (event: AgendaEvent) => void,
    private onViewInNote: (() => void) | undefined,
    private onDelete: (() => void) | undefined,
    private defaultReminderMinutes = 0,
    private overrideOccurrence: EventOccurrence | null = null,
    private prefillEnd?: string,
    private prefillTitle?: string,
  ) {
    super(app);
    const occ = overrideOccurrence;
    const allDay = occ ? (occ.event.allDay ?? defaultAllDay) : existing?.allDay ?? defaultAllDay;
    const start = occ ? occ.start : existing?.start ?? initialStart(prefillStart ?? "", allDay);
    const rrulePreset = occ ? "none" : existing ? presetForRrule(existing.rrule) : "none";
    const end = (occ
      ? occ.end
      : existing
        ? (existing.end ?? "")
        : prefillEnd ?? defaultEndFor(start, allDay)) ?? "";
    this.fields = {
      title: existing?.title ?? prefillTitle ?? "",
      start,
      end,
      allDay,
      location: existing?.location ?? "",
      organizer: existing?.organizer ?? "",
      attendees: existing?.attendees?.join(", ") ?? "",
      status: existing?.status ?? "",
      rsvp: existing?.rsvp ?? "",
      category: existing?.category ?? defaultCategory,
      description: existing?.description ?? "",
      reminder: (() => {
        const reminderEvent = occ?.event ?? existing;
        if (reminderEvent) return getReminderMinutes(reminderEvent).map(formatReminderInput).join(", ");
        return defaultReminderMinutes >= 0 ? formatReminderInput(defaultReminderMinutes) : "";
      })(),
      rrulePreset,
      rruleRaw: occ ? "" : existing?.rrule ?? "",
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

    // 提醒: one unit-bearing value per row makes multiple VALARM entries editable.
    const reminderSetting = new Setting(advanced)
      .setName(t("form.reminder.name"))
      .setDesc(t("form.reminder.desc"));
    const reminderEditor = reminderSetting.controlEl.createDiv({ cls: "ogenda-form-reminder-editor" });
    const reminderList = reminderEditor.createDiv({ cls: "ogenda-form-reminder-list" });
    const reminderRows = splitReminderInput(this.fields.reminder);
    const reminderOptionsId = "ogenda-reminder-options";
    const reminderOptions = reminderEditor.createEl("datalist", { attr: { id: reminderOptionsId } });
    for (const opt of REMINDER_OPTIONS.filter((o) => o.value !== "")) {
      reminderOptions.createEl("option", {
        value: formatReminderInput(Number(opt.value)),
        text: t(opt.labelKey),
        attr: { label: t(opt.labelKey) },
      });
    }
    const syncReminderField = () => {
      this.fields.reminder = joinReminderInputs(reminderRows);
      this.updateValidity();
    };
    const renderReminderRows = (focusLast = false) => {
      reminderList.empty();
      reminderRows.forEach((value, index) => {
        const row = reminderList.createDiv({ cls: "ogenda-form-reminder-row" });
        const reminderInput = row.createEl("input", {
          type: "text",
          cls: "ogenda-form-reminders-input",
          attr: {
            inputmode: "text",
            autocomplete: "off",
            spellcheck: "false",
            placeholder: t("form.reminder.placeholderSingle"),
            list: reminderOptionsId,
          },
        });
        reminderInput.value = value;
        reminderInput.addEventListener("input", () => {
          reminderRows[index] = reminderInput.value;
          syncReminderField();
        });
        // Keep Enter in a reminder row from triggering the form-level Save handler.
        reminderInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") event.stopPropagation();
        });
        const removeButton = row.createEl("button", {
          text: "×",
          cls: "ogenda-form-reminder-remove",
          attr: {
            type: "button",
            title: t("form.reminder.remove"),
            "aria-label": t("form.reminder.remove"),
          },
        });
        removeButton.addEventListener("click", () => {
          reminderRows.splice(index, 1);
          renderReminderRows();
          syncReminderField();
        });
      });
      if (focusLast) {
        const inputs = reminderList.querySelectorAll<HTMLInputElement>(".ogenda-form-reminders-input");
        inputs.item(inputs.length - 1)?.focus();
      }
    };
    const addReminderButton = reminderEditor.createEl("button", {
      text: t("form.reminder.add"),
      cls: "ogenda-form-reminder-add",
      attr: { type: "button" },
    });
    addReminderButton.addEventListener("click", () => {
      reminderRows.push("");
      renderReminderRows(true);
      syncReminderField();
    });
    renderReminderRows();

    // 重复
    const rruleSetting = new Setting(advanced).setName(t("form.rrule.name"));
    rruleSetting.addDropdown((d) => {
      for (const p of RRULE_PRESETS) d.addOption(p.value, t(p.labelKey));
      d.setValue(this.fields.rrulePreset);
      d.onChange((v) => {
        this.fields.rrulePreset = v;
        if (this.rruleCustomWrap) this.rruleCustomWrap.style.display = v === "custom" ? "" : "none";
        this.updateValidity();
      });
    });
    this.rruleCustomWrap = advanced.createDiv({ cls: "ogenda-form-rrule-custom" });
    this.rruleCustomWrap.createEl("label", { text: t("form.rrule.customLabel"), cls: "ogenda-form-rrule-label" });
    this.rruleCustomInput = this.rruleCustomWrap.createEl("input", {
      type: "text",
      cls: "ogenda-form-rrule-input",
      attr: { placeholder: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", spellcheck: "false", autocomplete: "off" },
    });
    this.rruleCustomInput.value = this.fields.rruleRaw;
    this.rruleCustomInput.addEventListener("input", () => {
      this.fields.rruleRaw = this.rruleCustomInput!.value;
      this.updateValidity();
    });
    this.rruleCustomWrap.style.display = this.fields.rrulePreset === "custom" ? "" : "none";

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
    if (this.fields.rrulePreset === "custom" && !isValidRrule(this.fields.rruleRaw)) {
      errors.push(t("validate.rruleInvalid"));
    }
    if (timeInvalid) {
      errors.push(t("form.timeInvalid"));
    } else {
      const result = validateEventForm({
        title: this.fields.title,
        start: this.readStartIso(),
        end: this.readEndIso(),
        allDay: this.fields.allDay,
        reminder: this.fields.reminder,
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
    const event = this.overrideOccurrence
      ? buildEventFromFields(this.fields, null, generateUid)
      : buildEventFromFields(this.fields, this.existing, generateUid);
    this.close();
    this.onSubmit(event);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
