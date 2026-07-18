import { describe, it, expect } from "vitest";
import { AgendaEvent, eventToFields, hashEvent } from "../../src/core/event";

const ev: AgendaEvent = {
  uid: "abc@x",
  title: "团队周会",
  start: "2026-07-14T15:00:00",
  end: "2026-07-14T16:00:00",
  allDay: false,
  tz: "Asia/Shanghai",
  location: "会议室A",
  organizer: "alice@example.com",
  attendees: ["a@x", "b@x"],
  status: "confirmed",
  category: "工作",
  tags: ["a", "b"],
  origin: "synced",
  source: "imap/gmail",
  protocol: "imap",
};

describe("eventToFields", () => {
  it("maps camelCase event to snake_case file fields", () => {
    const f = eventToFields(ev);
    expect(f.uid).toBe("abc@x");
    expect(f.title).toBe("团队周会");
    expect(f.start).toBe("2026-07-14T15:00:00");
    expect(f.all_day).toBe("false");
    expect(f.attendees).toBe("a@x, b@x");
    expect(f.source).toBe("imap/gmail");
    expect(f.category).toBe("工作");
    expect(f.tags).toBe("a, b");
  });
  it("omits empty/undefined fields", () => {
    const f = eventToFields({ uid: "u", title: "t", start: "2026-07-14T09:00:00", origin: "local" });
    expect("end" in f).toBe(false);
    expect("location" in f).toBe(false);
    expect(f.origin).toBe("local");
  });
  it("maps etag and href when present (CalDAV sync metadata)", () => {
    const f = eventToFields({
      uid: "u",
      title: "t",
      start: "2026-07-14T09:00:00",
      origin: "synced",
      etag: '"e1"',
      href: "https://p1.example/cal/u.ics",
    });
    expect(f.etag).toBe('"e1"');
    expect(f.href).toBe("https://p1.example/cal/u.ics");
  });
});

describe("hashEvent", () => {
  const a: AgendaEvent = { uid: "u", title: "会", start: "2026-07-14T15:00:00", origin: "synced" };
  it("changes when a calendar field changes", () => {
    expect(hashEvent({ ...a, title: "会2" })).not.toBe(hashEvent(a));
    expect(hashEvent({ ...a, location: "B" })).not.toBe(hashEvent(a));
  });
  it("is stable when only metadata changes (etag/href/base_hash/source)", () => {
    expect(
      hashEvent({ ...a, etag: '"x"', href: "https://y", baseHash: "z", source: "s2", protocol: "caldav" }),
    ).toBe(hashEvent(a));
  });
});
