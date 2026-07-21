import { describe, it, expect } from "vitest";
import { AgendaEvent, eventToFields, hashEvent, escapeMultiline, unescapeMultiline } from "../../src/core/event";

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
  it("maps serverDeleted when true (sync metadata)", () => {
    const f = eventToFields({
      uid: "u",
      title: "t",
      start: "2026-07-14T09:00:00",
      origin: "synced",
      serverDeleted: true,
    });
    expect(f.server_deleted).toBe("true");
  });
  it("omits serverDeleted when undefined", () => {
    const f = eventToFields({ uid: "u", title: "t", start: "2026-07-14T09:00:00", origin: "local" });
    expect("server_deleted" in f).toBe(false);
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
  it("is stable when serverDeleted changes (sync metadata)", () => {
    expect(hashEvent({ ...a, serverDeleted: true })).toBe(hashEvent(a));
  });
});

describe("escapeMultiline / unescapeMultiline", () => {
  it("escapes newlines and backslashes for single-line md storage, and reverses exactly", () => {
    const raw = "第一行\n第二行;含,标点\\反斜杠";
    const esc = escapeMultiline(raw);
    expect(esc).not.toContain("\n");
    expect(esc).toBe("第一行\\n第二行;含,标点\\\\反斜杠");
    expect(unescapeMultiline(esc)).toBe(raw);
  });
  it("preserves a user-typed literal backslash-n through the round-trip", () => {
    const raw = "字面\\n不是换行";
    expect(unescapeMultiline(escapeMultiline(raw))).toBe(raw);
  });
  it("normalizes CRLF to \\n", () => {
    expect(escapeMultiline("a\r\nb")).toBe("a\\nb");
  });
});

describe("eventToFields — description", () => {
  it("writes description escaped as a single line", () => {
    const f = eventToFields({ uid: "u", title: "t", start: "2026-07-14T09:00:00", origin: "local", description: "一\n二" });
    expect(f.description).toBe("一\\n二");
  });
  it("omits description when empty/undefined", () => {
    expect("description" in eventToFields({ uid: "u", title: "t", start: "s", origin: "local" })).toBe(false);
  });
});

describe("hashEvent — extended field set", () => {
  /** Pre-extension canonical hash (5 base fields only), kept as an upgrade-stability oracle. */
  function legacyHash(ev: AgendaEvent): string {
    const canon = [
      ev.title ?? "", ev.start ?? "", ev.end ?? "",
      ev.allDay === undefined ? "" : String(ev.allDay), ev.location ?? "",
    ].join("\0");
    let h = 0x811c9dc5;
    for (let i = 0; i < canon.length; i++) { h ^= canon.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  const b: AgendaEvent = { uid: "u", title: "会", start: "2026-07-14T15:00:00", origin: "synced" };

  it("keeps the pre-extension hash when none of the new fields are set (no mass re-push on upgrade)", () => {
    expect(hashEvent(b)).toBe(legacyHash(b));
    expect(hashEvent({ ...b, end: "2026-07-14T16:00:00", allDay: false, location: "A" })).toBe(
      legacyHash({ ...b, end: "2026-07-14T16:00:00", allDay: false, location: "A" }),
    );
  });
  it("changes when any synced field changes", () => {
    expect(hashEvent({ ...b, description: "备注" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, organizer: "a@x" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, attendees: ["a@x"] })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, status: "confirmed" })).not.toBe(hashEvent(b));
    expect(hashEvent({ ...b, category: "工作" })).not.toBe(hashEvent(b));
  });
  it("does NOT change for local-only or non-hashed fields (rsvp/rrule/tz/url)", () => {
    expect(hashEvent({ ...b, rsvp: "ACCEPTED" })).toBe(hashEvent(b));
    expect(hashEvent({ ...b, rrule: "FREQ=DAILY" })).toBe(hashEvent(b));
  });
  it("distinguishes which field a value lives in (no aliasing between single appended fields)", () => {
    expect(hashEvent({ ...b, description: "X" })).not.toBe(hashEvent({ ...b, organizer: "X" }));
    expect(hashEvent({ ...b, status: "X" })).not.toBe(hashEvent({ ...b, category: "X" }));
  });
  it("attendees order matters (join is positional)", () => {
    expect(hashEvent({ ...b, attendees: ["a@x", "b@x"] })).not.toBe(hashEvent({ ...b, attendees: ["b@x", "a@x"] }));
  });
});
