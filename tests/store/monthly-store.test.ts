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
