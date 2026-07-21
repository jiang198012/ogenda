import { describe, it, expect } from "vitest";
import { localToEvent } from "../../src/agenda-panel/local-to-event";
import { buildEventFromFields, RawFormFields } from "../../src/agenda-panel/event-form-fields";
import { LocalEvent } from "../../src/store/monthly-store";

const blankFields = (): RawFormFields => ({
  title: "", start: "", end: "", allDay: false,
  location: "", organizer: "", attendees: "",
  status: "", rsvp: "", category: "", description: "",
});

const syncedLocal = (): LocalEvent => ({
  uid: "sample-1@ogenda",
  hasHref: true,
  prose: "",
  fields: {
    uid: "sample-1@ogenda", title: "周会", start: "2026-07-16T14:00:00", end: "2026-07-16T15:00:00",
    all_day: "false", tz: "Asia/Shanghai", location: "会议室A", status: "confirmed", category: "工作",
    origin: "synced", etag: '"e1"', href: "https://x/sample-1.ics", base_hash: "abc123",
  },
});

describe("localToEvent", () => {
  it("carries the sync metadata (href/etag/baseHash) and the real origin, not a hardcoded one", () => {
    const ev = localToEvent(syncedLocal());
    expect(ev.href).toBe("https://x/sample-1.ics");
    expect(ev.etag).toBe('"e1"');
    expect(ev.baseHash).toBe("abc123");
    expect(ev.origin).toBe("synced");
    expect(ev.tz).toBe("Asia/Shanghai");
  });

  it("reflects a local-origin block as origin 'local', not synced", () => {
    const l: LocalEvent = { uid: "u", hasHref: false, prose: "", fields: { uid: "u", title: "t", start: "2026-07-20", origin: "local" } };
    expect(localToEvent(l).origin).toBe("local");
  });

  it("round-trips through the edit form without dropping href/etag/baseHash", () => {
    // Editing a synced event in the panel: localToEvent builds `existing`, the form changes only the title.
    const existing = localToEvent(syncedLocal());
    const fields: RawFormFields = { ...blankFields(), title: "周会(改)", start: existing.start, end: existing.end ?? "" };
    const saved = buildEventFromFields(fields, existing, () => "should-not-be-used@ogenda");
    expect(saved.uid).toBe("sample-1@ogenda");
    expect(saved.href).toBe("https://x/sample-1.ics");
    expect(saved.etag).toBe('"e1"');
    expect(saved.baseHash).toBe("abc123");
    expect(saved.title).toBe("周会(改)");
  });
});

it("unescapes a stored single-line description back to multi-line", () => {
  const l = syncedLocal();
  l.fields.description = "第一行\\n第二行";
  expect(localToEvent(l).description).toBe("第一行\n第二行");
});

it("description is undefined when the field is absent", () => {
  expect(localToEvent(syncedLocal()).description).toBeUndefined();
});
