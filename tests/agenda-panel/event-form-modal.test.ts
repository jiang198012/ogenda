// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createDateInputControls } from "../../src/agenda-panel/event-date-input";

describe("createDateInputControls", () => {
  it("exposes one stable text value plus an accessible calendar trigger", () => {
    const host = document.createElement("div");
    const commits: string[] = [];
    const controls = createDateInputControls(host, {
      label: "开始日期",
      calendarLabel: "打开开始日期日历",
      testId: "ogenda-start-date",
      onCommit: (value) => commits.push(value),
    });

    expect(controls.textInput.type).toBe("text");
    expect(controls.textInput.dataset.testid).toBe("ogenda-start-date");
    expect(controls.textInput.getAttribute("aria-label")).toBe("开始日期");
    expect(controls.textInput.getAttribute("placeholder")).toBe("YYYY-MM-DD");
    expect(controls.textInput.getAttribute("inputmode")).toBe("numeric");
    expect(controls.nativeInput.type).toBe("date");
    expect(controls.nativeInput.getAttribute("aria-hidden")).toBe("true");
    expect(controls.pickerButton.type).toBe("button");
    expect(controls.pickerButton.getAttribute("aria-label")).toBe("打开开始日期日历");
  });

  it("keeps text and native values synchronized and commits keyboard/native changes", () => {
    const host = document.createElement("div");
    const commits: string[] = [];
    const controls = createDateInputControls(host, {
      label: "结束日期",
      calendarLabel: "打开结束日期日历",
      testId: "ogenda-end-date",
      onCommit: (value) => commits.push(value),
    });

    controls.sync("2026-07-14");
    expect(controls.textInput.value).toBe("2026-07-14");
    expect(controls.nativeInput.value).toBe("2026-07-14");

    controls.textInput.value = "2026-07-15";
    controls.textInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits.at(-1)).toBe("2026-07-15");

    controls.nativeInput.value = "2026-07-16";
    controls.nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(controls.textInput.value).toBe("2026-07-16");
    expect(commits.at(-1)).toBe("2026-07-16");
  });
});
