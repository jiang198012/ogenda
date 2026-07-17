import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore } from "../../src/store/monthly-store";
import { SyncService } from "../../src/sync/sync-service";

const mk = (uid: string, start: string): AgendaEvent => ({
  uid, title: "t", start, origin: "synced", source: "s", protocol: "imap",
});

describe("SyncService", () => {
  it("collects from connectors, writes to store, reports summary", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const conn = { id: "test", fetch: async () => [mk("a@x", "2026-07-14T15:00:00")] };
    const msgs: string[] = [];
    const svc = new SyncService([conn], store, (m) => msgs.push(m));
    const s = await svc.syncNow();
    expect(s.added).toBe(1);
    expect(await fs.read("Agenda/2026-07.md")).toContain("a@x");
    expect(msgs.some((m) => m.includes("同步完成"))).toBe(true);
  });
  it("keeps going when one connector throws", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const bad = { id: "bad", fetch: async () => { throw new Error("boom"); } };
    const good = { id: "good", fetch: async () => [mk("b@x", "2026-07-20T09:00:00")] };
    const msgs: string[] = [];
    const svc = new SyncService([bad, good], store, (m) => msgs.push(m));
    const s = await svc.syncNow();
    expect(s.added).toBe(1);
    expect(msgs.some((m) => m.includes("同步失败(bad)"))).toBe(true);
  });
});
