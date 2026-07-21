import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore, monthOf } from "../../src/store/monthly-store";

const mk = (uid: string, start: string, title: string): AgendaEvent => ({
  uid, title, start, origin: "synced", source: "imap/gmail", protocol: "imap",
});

describe("MonthlyStore", () => {
  it("monthOf extracts YYYY-MM", () => {
    expect(monthOf("2026-07-14T15:00:00")).toBe("2026-07");
    expect(monthOf("2026-12-01")).toBe("2026-12");
  });
  it("groups events into monthly files", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const s = await store.sync([mk("a@x", "2026-07-14T15:00:00", "七"), mk("b@x", "2026-08-01T09:00:00", "八")]);
    expect(s.added).toBe(2);
    expect(s.months.sort()).toEqual(["2026-07", "2026-08"]);
    expect(await fs.read("Agenda/2026-07.md")).toContain("a@x");
    expect(await fs.read("Agenda/2026-08.md")).toContain("b@x");
  });
  it("is idempotent by uid and preserves user prose across re-sync", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/\n$/, "") + "\n\n我的纪要\n");
    const s2 = await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    expect(s2.added).toBe(0);
    expect(s2.updated).toBe(0);
    expect(await fs.read(p)).toContain("我的纪要");
  });
  it("reports 0 and does not rewrite the file when nothing changed", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    const p = "Agenda/2026-07.md";
    const before = await fs.read(p);
    const s2 = await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    expect(s2.added).toBe(0);
    expect(s2.updated).toBe(0);
    expect(s2.months).toEqual([]);
    expect(await fs.read(p)).toBe(before);
  });
  it("counts as updated only when a field actually changed", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mk("a@x", "2026-07-14T15:00:00", "会")]);
    const s2 = await store.sync([mk("a@x", "2026-07-14T15:00:00", "会(改名)")]);
    expect(s2.updated).toBe(1);
  });
});

describe("MonthlyStore.readEvents", () => {
  it("reads event blocks across multiple monthly files, keyed by uid with prose and href flag", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mk("a@x", "2026-07-14T15:00:00", "七月会"), mk("b@x", "2026-08-01T09:00:00", "八月会")]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/\n$/, "") + "\n\n我的纪要\n");

    const events = await store.readEvents();
    expect(events.map((e) => e.uid).sort()).toEqual(["a@x", "b@x"]);

    const july = events.find((e) => e.uid === "a@x")!;
    expect(july.fields.title).toBe("七月会");
    expect(july.prose).toBe("我的纪要");
    expect(july.hasHref).toBe(false);
  });

  it("hasHref is true when the block carries an href field (previously synced via CalDAV)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([{ ...mk("a@x", "2026-07-14T15:00:00", "会"), href: "https://p1.example/cal/a.ics" }]);
    const events = await store.readEvents();
    expect(events[0].hasHref).toBe(true);
  });

  it("skips blocks with no uid field and returns [] when the folder is empty", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    expect(await store.readEvents()).toEqual([]);
    await fs.write("Agenda/2026-07.md", "## 手写的块\n\n没有 uid 字段\n");
    expect(await store.readEvents()).toEqual([]);
  });
});

describe("MonthlyStore.savePanelEvent (#53)", () => {
  it("clears a blanked optional field but preserves sync metadata (href)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const ev: AgendaEvent = {
      uid: "a@x", title: "会", start: "2026-07-14T10:00:00", origin: "synced",
      href: "https://x/a.ics", location: "会议室",
    };
    await store.savePanelEvent(ev);
    const p = "Agenda/2026-07.md";
    expect(await fs.read(p)).toContain("会议室");

    await store.savePanelEvent({ ...ev, location: undefined }); // user cleared location
    const text = (await fs.read(p))!;
    expect(text).not.toContain("会议室");
    expect(text).toContain("href:: https://x/a.ics");
  });
});

describe("MonthlyStore.sync — server-authoritative field clearing", () => {
  const full = (uid: string): AgendaEvent => ({
    uid, title: "会", start: "2026-07-14T10:00:00", origin: "synced",
    location: "会议室", description: "备注", organizer: "a@x", attendees: ["b@x"],
    status: "confirmed", category: "工作", rrule: "FREQ=DAILY",
    rsvp: "ACCEPTED",
    href: "https://x/a.ics", etag: '"e1"',
  });

  it("deletes synced fields the server no longer has, but never local-only rsvp nor sync metadata", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([full("a@x")]);
    const p = "Agenda/2026-07.md";
    let text = (await fs.read(p))!;
    expect(text).toContain("description:: 备注");
    expect(text).toContain("rsvp:: ACCEPTED");

    // server drops location/description/organizer/attendees/status/category/rrule
    const stripped = full("a@x");
    delete stripped.location; delete stripped.description; delete stripped.organizer;
    delete stripped.attendees; delete stripped.status; delete stripped.category; delete stripped.rrule;
    await store.sync([stripped]);

    text = (await fs.read(p))!;
    for (const gone of ["location::", "description::", "organizer::", "attendees::", "status::", "category::", "rrule::"]) {
      expect(text).not.toContain(gone);
    }
    // local-only fields and sync metadata survive
    expect(text).toContain("rsvp:: ACCEPTED");
    expect(text).toContain("href:: https://x/a.ics");
    expect(text).toContain("etag::");
  });

  it("still updates fields the server DOES send (clearing does not break normal updates)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([full("a@x")]);
    const updated = { ...full("a@x"), description: "服务器改过的备注", etag: '"e2"' };
    await store.sync([updated]);
    expect(await fs.read("Agenda/2026-07.md")).toContain("description:: 服务器改过的备注");
  });
});

describe("MonthlyStore.savePanelEvent — description is panel-clearable", () => {
  it("clears a blanked description", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const ev: AgendaEvent = {
      uid: "a@x", title: "会", start: "2026-07-14T10:00:00", origin: "synced",
      href: "https://x/a.ics", description: "旧备注",
    };
    await store.savePanelEvent(ev);
    const p = "Agenda/2026-07.md";
    expect(await fs.read(p)).toContain("description:: 旧备注");

    await store.savePanelEvent({ ...ev, description: undefined });
    const text = (await fs.read(p))!;
    expect(text).not.toContain("旧备注");
    expect(text).toContain("href:: https://x/a.ics");
  });
});
