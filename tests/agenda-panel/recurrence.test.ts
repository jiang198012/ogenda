import { describe, it, expect } from "vitest";
import { buildRrule, presetForRrule, isValidRrule, weekdayForIso } from "../../src/agenda-panel/recurrence";
import { buildEventFromFields, RawFormFields } from "../../src/agenda-panel/event-form-fields";
import { AgendaEvent } from "../../src/core/event";
import { expandOccurrences } from "../../src/agenda-panel/occurrences";

describe("weekdayForIso", () => {
  it("maps a date to a Monday-first weekday code", () => {
    expect(weekdayForIso("2026-07-13T09:00:00")).toBe("MO"); // Monday
    expect(weekdayForIso("2026-07-14")).toBe("TU");
    expect(weekdayForIso("2026-07-19")).toBe("SU");
    expect(weekdayForIso("bad")).toBeNull();
  });
});

describe("presetForRrule", () => {
  it("classifies known presets", () => {
    expect(presetForRrule(undefined)).toBe("none");
    expect(presetForRrule("")).toBe("none");
    expect(presetForRrule("FREQ=DAILY")).toBe("daily");
    expect(presetForRrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("weekdays");
    expect(presetForRrule("FREQ=WEEKLY;BYDAY=WE")).toBe("weekly");
    expect(presetForRrule("FREQ=MONTHLY")).toBe("monthly");
    expect(presetForRrule("FREQ=YEARLY")).toBe("yearly");
  });

  it("falls back to custom for anything else", () => {
    expect(presetForRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe("custom");
    expect(presetForRrule("FREQ=DAILY;UNTIL=20261231T000000Z")).toBe("custom");
  });
});

describe("buildRrule", () => {
  it("none → undefined;daily/weekdays/monthly/yearly literal", () => {
    expect(buildRrule("none", "2026-07-14T09:00:00", "")).toBeUndefined();
    expect(buildRrule("daily", "2026-07-14T09:00:00", "")).toBe("FREQ=DAILY");
    expect(buildRrule("weekdays", "2026-07-14T09:00:00", "")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(buildRrule("monthly", "2026-07-14T09:00:00", "")).toBe("FREQ=MONTHLY");
    expect(buildRrule("yearly", "2026-07-14T09:00:00", "")).toBe("FREQ=YEARLY");
  });

  it("weekly derives BYDAY from the start date", () => {
    expect(buildRrule("weekly", "2026-07-14T09:00:00", "")).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(buildRrule("weekly", "2026-07-17T09:00:00", "")).toBe("FREQ=WEEKLY;BYDAY=FR");
  });

  it("custom passes the raw rule through", () => {
    expect(buildRrule("custom", "2026-07-14T09:00:00", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
    );
    expect(buildRrule("custom", "2026-07-14T09:00:00", "  ")).toBeUndefined();
  });
});

describe("isValidRrule", () => {
  it("accepts valid rules and rejects garbage", () => {
    expect(isValidRrule("FREQ=WEEKLY;BYDAY=MO")).toBe(true);
    expect(isValidRrule("FREQ=DAILY;COUNT=3")).toBe(true);
    expect(isValidRrule("")).toBe(false);
    expect(isValidRrule("FREQ=")).toBe(false);
    expect(isValidRrule("hello world")).toBe(false);
  });
});

describe("buildEventFromFields — recurrence passthrough", () => {
  const fields = (o: Partial<RawFormFields>): RawFormFields => ({
    title: "周会",
    start: "2026-07-17T10:00:00",
    end: "2026-07-17T11:00:00",
    allDay: false,
    location: "",
    organizer: "",
    attendees: "",
    status: "",
    rsvp: "",
    category: "",
    description: "",
    reminder: "",
    rrulePreset: "none",
    rruleRaw: "",
    ...o,
  });

  it("builds a weekly RRULE from the weekly preset + start date", () => {
    const ev = buildEventFromFields(fields({ rrulePreset: "weekly" }), null, () => "u1");
    expect(ev.rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
  });

  it("none preset clears recurrence on edit", () => {
    const existing: AgendaEvent = {
      uid: "u1", title: "周会", start: "2026-07-17T10:00:00", origin: "local", rrule: "FREQ=WEEKLY;BYDAY=FR",
    };
    const ev = buildEventFromFields(fields({ rrulePreset: "none" }), existing, () => "u1");
    expect(ev.rrule).toBeUndefined();
  });

  it("carries exdates through an edit (all occurrences)", () => {
    const existing: AgendaEvent = {
      uid: "u1", title: "周会", start: "2026-07-17T10:00:00", origin: "local",
      rrule: "FREQ=WEEKLY;BYDAY=FR", exdates: ["2026-07-31T10:00:00"],
    };
    const ev = buildEventFromFields(fields({ rrulePreset: "weekly" }), existing, () => "u1");
    expect(ev.exdates).toEqual(["2026-07-31T10:00:00"]);
  });

  it("drops recurrence when editing as an override occurrence (new uid, no rrule)", () => {
    const existing: AgendaEvent = {
      uid: "u1", title: "周会", start: "2026-07-17T10:00:00", origin: "synced", rrule: "FREQ=WEEKLY;BYDAY=FR", href: "https://x/1.ics", etag: "abc",
    };
    const ev = buildEventFromFields(fields({ rrulePreset: "none", rruleRaw: "" }), null, () => "new-uid");
    expect(ev.uid).toBe("new-uid");
    expect(ev.rrule).toBeUndefined();
    expect(ev.exdates).toBeUndefined();
    void existing;
  });
});

describe("exdates skip occurrences", () => {
  const mk = (o: Partial<AgendaEvent>): AgendaEvent => ({
    uid: "e1", title: "站会", start: "2026-07-13T09:00:00", end: "2026-07-13T09:15:00", origin: "local", ...o,
  });

  it("drops the excluded weekly occurrence", () => {
    const ev = mk({ rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: ["2026-07-27T09:00:00"] });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 7, 1));
    expect(out.map((o) => o.start)).toEqual(["2026-07-13T09:00:00", "2026-07-20T09:00:00"]);
  });

  it("drops an all-day excluded occurrence (date-only compare)", () => {
    const ev = mk({ start: "2026-07-01", allDay: true, rrule: "FREQ=MONTHLY", exdates: ["2026-08-01"] });
    const out = expandOccurrences([ev], new Date(2026, 6, 1), new Date(2026, 9, 1));
    expect(out.map((o) => o.start)).toEqual(["2026-07-01", "2026-09-01"]);
  });

  it("normalizes a trailing Z so UTC occurrences match wall-time exdates", () => {
    const ev = mk({ start: "2026-07-13T09:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: ["2026-07-20T09:00:00"] });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 30));
    const starts = out.map((o) => o.start);
    expect(starts).toContain("2026-07-13T09:00:00");
    expect(starts).toContain("2026-07-27T09:00:00");
    expect(starts).not.toContain("2026-07-20T09:00:00");
  });

  it("does not affect events without exdates", () => {
    const ev = mk({ rrule: "FREQ=DAILY" });
    const out = expandOccurrences([ev], new Date(2026, 6, 13), new Date(2026, 6, 16));
    expect(out).toHaveLength(3);
  });
});
