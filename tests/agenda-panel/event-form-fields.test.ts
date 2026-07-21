import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import {
  validateEventForm,
  buildEventFromFields,
  RawFormFields,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
  isoToDateValue,
  dateValueToIso,
  initialStart,
  shiftEndWithStart,
  defaultEndFor,
  RSVP_OPTIONS,
  shouldSaveOnEnter,
  getPredefinedCategories,
  getDefaultCategory,
} from "../../src/agenda-panel/event-form-fields";
import { setLanguage } from "../../src/i18n";

const blankFields = (): RawFormFields => ({
  title: "", start: "", end: "", allDay: false,
  location: "", organizer: "", attendees: "",
  status: "", rsvp: "", category: "", description: "",
});

describe("validateEventForm", () => {
  it("requires a non-empty title and start", () => {
    expect(validateEventForm({ title: "", start: "" }).valid).toBe(false);
    expect(validateEventForm({ title: "会议", start: "" }).valid).toBe(false);
    expect(validateEventForm({ title: "", start: "2026-07-20" }).valid).toBe(false);
    expect(validateEventForm({ title: "会议", start: "2026-07-20" }).valid).toBe(true);
  });

  it("rejects whitespace-only title/start", () => {
    expect(validateEventForm({ title: "   ", start: "2026-07-20" }).valid).toBe(false);
  });

  it("rejects an all-day event whose end is on or before the start (zero-length, #54)", () => {
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-14", allDay: true }).valid).toBe(false);
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-13", allDay: true }).valid).toBe(false);
  });
  it("accepts an all-day event whose end is the next day (exclusive)", () => {
    expect(validateEventForm({ title: "x", start: "2026-07-14", end: "2026-07-15", allDay: true }).valid).toBe(true);
  });
  it("applies a timed-specific end rule to timed events (end must be > start)", () => {
    expect(
      validateEventForm({ title: "x", start: "2026-07-14T10:00:00", end: "2026-07-14T09:00:00", allDay: false }).valid,
    ).toBe(false);
  });
});

describe("buildEventFromFields", () => {
  it("generates a new uid when creating (existing = null)", () => {
    const fields = { ...blankFields(), title: "新事件", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, null, () => "generated-uid@ogenda");
    expect(ev.uid).toBe("generated-uid@ogenda");
    expect(ev.origin).toBe("local");
  });

  it("preserves the existing uid/origin/href/etag/baseHash/rrule when editing", () => {
    const existing: AgendaEvent = {
      uid: "keep-me@ogenda", title: "old", start: "2026-07-01T09:00:00", origin: "synced",
      href: "https://x/a.ics", etag: '"e1"', baseHash: "abc123", rrule: "FREQ=WEEKLY",
      tz: "Asia/Shanghai", url: "https://x/event", busy: "BUSY", source: "iCloud",
      protocol: "caldav", serverDeleted: true, seq: 3, lastSynced: "2026-07-15T00:00:00Z",
    };
    const fields = { ...blankFields(), title: "改过的标题", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, existing, () => "should-not-be-used");
    expect(ev.uid).toBe("keep-me@ogenda");
    expect(ev.origin).toBe("synced");
    expect(ev.href).toBe("https://x/a.ics");
    expect(ev.etag).toBe('"e1"');
    expect(ev.baseHash).toBe("abc123");
    expect(ev.rrule).toBe("FREQ=WEEKLY");
    expect(ev.title).toBe("改过的标题");
    expect(ev.tz).toBe("Asia/Shanghai");
    expect(ev.url).toBe("https://x/event");
    expect(ev.busy).toBe("BUSY");
    expect(ev.source).toBe("iCloud");
    expect(ev.protocol).toBe("caldav");
    expect(ev.serverDeleted).toBe(true);
    expect(ev.seq).toBe(3);
    expect(ev.lastSynced).toBe("2026-07-15T00:00:00Z");
  });

  it("leaves tz/url/busy/source/protocol/serverDeleted/seq/lastSynced undefined when creating (existing = null)", () => {
    const fields = { ...blankFields(), title: "新事件", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, null, () => "generated-uid@ogenda");
    expect(ev.tz).toBeUndefined();
    expect(ev.url).toBeUndefined();
    expect(ev.busy).toBeUndefined();
    expect(ev.source).toBeUndefined();
    expect(ev.protocol).toBeUndefined();
    expect(ev.serverDeleted).toBeUndefined();
    expect(ev.seq).toBeUndefined();
    expect(ev.lastSynced).toBeUndefined();
  });

  it("splits attendees on comma, trimming whitespace, undefined when empty", () => {
    const fields = { ...blankFields(), title: "t", start: "2026-07-20T10:00:00", attendees: "a@x, b@x ,c@x" };
    const ev = buildEventFromFields(fields, null, () => "u@ogenda");
    expect(ev.attendees).toEqual(["a@x", "b@x", "c@x"]);
    const empty = buildEventFromFields({ ...blankFields(), title: "t", start: "2026-07-20T10:00:00" }, null, () => "u@ogenda");
    expect(empty.attendees).toBeUndefined();
  });

  it("converts blank optional text fields to undefined, not empty string", () => {
    const fields = { ...blankFields(), title: "t", start: "2026-07-20T10:00:00" };
    const ev = buildEventFromFields(fields, null, () => "u@ogenda");
    expect(ev.end).toBeUndefined();
    expect(ev.location).toBeUndefined();
    expect(ev.organizer).toBeUndefined();
    expect(ev.rsvp).toBeUndefined();
    expect(ev.status).toBeUndefined();
  });
});

describe("datetime field conversions (#51)", () => {
  it("isoToDatetimeLocalValue: ISO datetime → minute-precision local value", () => {
    expect(isoToDatetimeLocalValue("2026-07-14T15:00:00")).toBe("2026-07-14T15:00");
  });
  it("isoToDatetimeLocalValue: date-only → midnight local value", () => {
    expect(isoToDatetimeLocalValue("2026-07-14")).toBe("2026-07-14T00:00");
  });
  it("isoToDatetimeLocalValue: tolerates a lowercase t separator", () => {
    expect(isoToDatetimeLocalValue("2026-07-14t15:00:00")).toBe("2026-07-14T15:00");
  });
  it("datetimeLocalValueToIso: local value → ISO datetime with seconds", () => {
    expect(datetimeLocalValueToIso("2026-07-14T15:00")).toBe("2026-07-14T15:00:00");
  });
  it("isoToDateValue: datetime or date → date-only", () => {
    expect(isoToDateValue("2026-07-14T15:00:00")).toBe("2026-07-14");
    expect(isoToDateValue("2026-07-14")).toBe("2026-07-14");
  });
  it("dateValueToIso: date value → date-only ISO", () => {
    expect(dateValueToIso("2026-07-14")).toBe("2026-07-14");
  });
});

describe("initialStart (#52)", () => {
  it("all-day → date-only", () => {
    expect(initialStart("2026-07-14", true)).toBe("2026-07-14");
  });
  it("timed with a date-only prefill → injects a 09:00 default", () => {
    expect(initialStart("2026-07-14", false)).toBe("2026-07-14T09:00:00");
  });
  it("timed with a datetime prefill → keeps the time", () => {
    expect(initialStart("2026-07-14T15:30:00", false)).toBe("2026-07-14T15:30:00");
  });
  it("empty prefill → empty", () => {
    expect(initialStart("", false)).toBe("");
  });
});

describe("validateEventForm — timed end", () => {
  it("flags a timed event whose end is not after start", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "2026-07-19T13:00:00", allDay: false });
    expect(r.valid).toBe(false);
  });
  it("accepts a timed event whose end is after start", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "2026-07-19T15:00:00", allDay: false });
    expect(r.valid).toBe(true);
  });
  it("timed event with empty end is valid", () => {
    const r = validateEventForm({ title: "x", start: "2026-07-19T14:00:00", end: "", allDay: false });
    expect(r.valid).toBe(true);
  });
});

describe("shiftEndWithStart", () => {
  it("timed: preserves duration when start moves", () => {
    expect(shiftEndWithStart("2026-07-19T09:00:00", "2026-07-19T10:00:00", "2026-07-19T14:00:00")).toBe("2026-07-19T15:00:00");
  });
  it("timed: preserves a cross-midnight duration", () => {
    expect(shiftEndWithStart("2026-07-19T23:00:00", "2026-07-20T01:00:00", "2026-07-25T23:00:00")).toBe("2026-07-26T01:00:00");
  });
  it("all-day (date-only): preserves day span and stays date-only", () => {
    expect(shiftEndWithStart("2026-07-19", "2026-07-21", "2026-07-25")).toBe("2026-07-27");
  });
  it("empty end → unchanged empty", () => {
    expect(shiftEndWithStart("2026-07-19T09:00:00", "", "2026-07-20T09:00:00")).toBe("");
  });
});

describe("defaultEndFor", () => {
  it("timed new event → start + 1h", () => {
    expect(defaultEndFor("2026-07-19T09:00:00", false)).toBe("2026-07-19T10:00:00");
  });
  it("all-day → empty", () => {
    expect(defaultEndFor("2026-07-19", true)).toBe("");
  });
  it("empty start → empty", () => {
    expect(defaultEndFor("", false)).toBe("");
  });
});

describe("RSVP_OPTIONS", () => {
  it("lists the 4 PARTSTAT values in order", () => {
    expect(RSVP_OPTIONS.map((o) => o.value)).toEqual(["NEEDS-ACTION", "ACCEPTED", "DECLINED", "TENTATIVE"]);
  });
});

describe("category helpers", () => {
  it("getPredefinedCategories returns language-aware values and labels", () => {
    setLanguage("zh");
    const zhCats = getPredefinedCategories();
    expect(zhCats.map((c) => c.value)).toEqual(["工作", "个人", "学习", "会议", "旅行", "健康"]);
    expect(zhCats[0].label).toBe("工作");
    setLanguage("en");
    const enCats = getPredefinedCategories();
    expect(enCats.map((c) => c.value)).toEqual(["Work", "Personal", "Study", "Meeting", "Travel", "Health"]);
    expect(enCats[0].label).toBe("Work");
  });

  it("getDefaultCategory follows the current language", () => {
    setLanguage("zh");
    expect(getDefaultCategory()).toBe("工作");
    setLanguage("en");
    expect(getDefaultCategory()).toBe("Work");
  });
});

const baseFields = (over: Partial<RawFormFields> = {}): RawFormFields => ({
  title: "会", start: "2026-07-19T09:00:00", end: "", allDay: false,
  location: "", organizer: "", attendees: "", status: "", rsvp: "",
  category: "", description: "", ...over,
});

describe("buildEventFromFields — merged category + rsvp", () => {
  it("uses the single category field", () => {
    const ev = buildEventFromFields(baseFields({ category: "工作" }), null, () => "uid1");
    expect(ev.category).toBe("工作");
  });
  it("empty category → undefined", () => {
    const ev = buildEventFromFields(baseFields({ category: "  " }), null, () => "uid1");
    expect(ev.category).toBeUndefined();
  });
  it("stores the raw RSVP enum value", () => {
    const ev = buildEventFromFields(baseFields({ rsvp: "ACCEPTED" }), null, () => "uid1");
    expect(ev.rsvp).toBe("ACCEPTED");
  });
});

describe("buildEventFromFields — description", () => {
  it("carries description, trimmed", () => {
    const ev = buildEventFromFields(baseFields({ description: "  备注内容\n第二行  " }), null, () => "uid1");
    expect(ev.description).toBe("备注内容\n第二行");
  });
  it("empty/blank description → undefined", () => {
    expect(buildEventFromFields(baseFields({ description: "   " }), null, () => "uid1").description).toBeUndefined();
    expect(buildEventFromFields(baseFields({}), null, () => "uid1").description).toBeUndefined();
  });
  it("editing an event whose fields keep a description does not lose it", () => {
    const existing = buildEventFromFields(baseFields({ description: "旧备注" }), null, () => "uid1");
    const saved = buildEventFromFields(baseFields({ description: existing.description! }), existing, () => "uid2");
    expect(saved.description).toBe("旧备注");
  });
});

describe("shouldSaveOnEnter", () => {
  it("saves on Enter when not composing, not in a textarea, and save is enabled", () => {
    expect(shouldSaveOnEnter("Enter", false, false, false)).toBe(true);
  });
  it("does not save on a non-Enter key", () => {
    expect(shouldSaveOnEnter("a", false, false, false)).toBe(false);
  });
  it("does not save while IME-composing", () => {
    expect(shouldSaveOnEnter("Enter", true, false, false)).toBe(false);
  });
  it("does not save inside the description textarea (Enter = newline there)", () => {
    expect(shouldSaveOnEnter("Enter", false, true, false)).toBe(false);
  });
  it("does not save while the save button is disabled", () => {
    expect(shouldSaveOnEnter("Enter", false, false, true)).toBe(false);
  });
});
