export interface DateInputControls {
  textInput: HTMLInputElement;
  nativeInput: HTMLInputElement;
  pickerButton: HTMLButtonElement;
  sync(value: string): void;
}

export interface DateInputOptions {
  label: string;
  calendarLabel: string;
  testId: string;
  onCommit: (value: string) => void;
  onInput?: (value: string) => void;
}

/**
 * Render one stable text date value alongside a visually-hidden native date
 * picker. The text field is the keyboard/automation seam; the native input is
 * retained only so users can still choose a date from the platform calendar.
 */
export function createDateInputControls(container: HTMLElement, options: DateInputOptions): DateInputControls {
  const wrap = document.createElement("div");
  wrap.className = "ogenda-form-date-controls";

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "ogenda-form-date-text";
  textInput.placeholder = "YYYY-MM-DD";
  textInput.setAttribute("aria-label", options.label);
  textInput.setAttribute("inputmode", "numeric");
  textInput.setAttribute("autocomplete", "off");
  textInput.setAttribute("spellcheck", "false");
  textInput.dataset.testid = options.testId;

  const nativeInput = document.createElement("input");
  nativeInput.type = "date";
  nativeInput.className = "ogenda-form-native-date";
  nativeInput.setAttribute("aria-hidden", "true");
  nativeInput.tabIndex = -1;
  nativeInput.dataset.testid = `${options.testId}-native`;

  const pickerButton = document.createElement("button");
  pickerButton.type = "button";
  pickerButton.className = "ogenda-form-date-picker";
  pickerButton.textContent = "▣";
  pickerButton.setAttribute("aria-label", options.calendarLabel);
  pickerButton.title = options.calendarLabel;
  pickerButton.dataset.testid = `${options.testId}-picker`;

  textInput.addEventListener("input", () => options.onInput?.(textInput.value));
  textInput.addEventListener("change", () => options.onCommit(textInput.value));
  nativeInput.addEventListener("change", () => {
    textInput.value = nativeInput.value;
    options.onCommit(nativeInput.value);
  });
  pickerButton.addEventListener("click", () => {
    const inputWithPicker = nativeInput as HTMLInputElement & { showPicker?: () => void };
    if (typeof inputWithPicker.showPicker === "function") {
      try {
        inputWithPicker.showPicker();
        return;
      } catch {
        // Some embedded Chromium builds reject showPicker for clipped inputs;
        // the native click path is the compatible fallback.
      }
    }
    nativeInput.click();
  });

  wrap.append(textInput, nativeInput, pickerButton);
  container.appendChild(wrap);

  return {
    textInput,
    nativeInput,
    pickerButton,
    sync(value: string) {
      textInput.value = value;
      nativeInput.value = value;
    },
  };
}
