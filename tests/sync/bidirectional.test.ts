import { describe, it, expect } from "vitest";
import { AgendaEvent, hashEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore } from "../../src/store/monthly-store";
import { CalDavSource, syncBidirectional } from "../../src/sync/bidirectional";

const CAL_URL = "https://cal.example/home";

const mkSynced = (o: Partial<AgendaEvent> = {}): AgendaEvent => {
  const ev: AgendaEvent = {
    uid: "a@x",
    title: "会议",
    start: "2026-07-14T15:00:00",
    origin: "synced",
    source: "caldav/icloud",
    protocol: "caldav",
    href: "https://cal.example/home/a-x.ics",
    etag: '"e1"',
    ...o,
  };
  return { ...ev, baseHash: hashEvent(ev) };
};

interface PutCall {
  url: string;
  ics: string;
  ifMatch?: string;
}

interface DeleteCall {
  url: string;
  ifMatch: string;
}

function fakeSource(
  server: AgendaEvent[],
  putStatus: { status: number; etag?: string },
  calls: PutCall[],
  deleteStatus: { status: number } = { status: 204 },
  deleteCalls: DeleteCall[] = [],
): CalDavSource {
  return {
    fetch: async () => server,
    putEvent: async (url, ics, ifMatch) => {
      calls.push({ url, ics, ifMatch });
      return putStatus;
    },
    deleteEvent: async (url, ifMatch) => {
      deleteCalls.push({ url, ifMatch });
      return deleteStatus;
    },
  };
}

const TRACKED_A_X = { href: "https://cal.example/home/a-x.ics", etag: '"e1"' };

describe("syncBidirectional", () => {
  it("pushes a local edit to the server (PUT If-Match) and updates the local etag/base_hash", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/会议/g, "改过的会议"));

    const calls: PutCall[] = [];
    const source = fakeSource([mkSynced()], { status: 204, etag: '"e2"' }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.pushed).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://cal.example/home/a-x.ics");
    expect(calls[0].ifMatch).toBe('"e1"');
    expect(calls[0].ics).toContain("改过的会议");

    const text = (await fs.read(p))!;
    expect(text).toContain("改过的会议");
    expect(text).toContain('etag:: "e2"');

    // backward compatibility: no SyncState was ever written for this store, so D3 deletion
    // propagation must be a no-op alongside the D2 push behavior asserted above.
    expect(summary.deleted).toBe(0);
    expect(summary.markedServerDeleted).toBe(0);
  });

  it("creates a hand-written local block (no href) on the server and records the new href/etag", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    await fs.write(
      p,
      "# 2026-07\n\n## 15:00 新会议\n- uid:: new1\n- title:: 新会议\n- start:: 2026-07-15T15:00:00\n",
    );

    const calls: PutCall[] = [];
    const source = fakeSource([], { status: 201, etag: '"c1"' }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.created).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://cal.example/home/new1.ics");
    expect(calls[0].ifMatch).toBeUndefined();
    expect(calls[0].ics).toContain("新会议");

    const text = (await fs.read(p))!;
    expect(text).toContain("href:: https://cal.example/home/new1.ics");
    expect(text).toContain('etag:: "c1"');
    expect(text).toMatch(/base_hash:: \w+/);
  });

  it("pulls a server-side edit into the local file when local was not edited (no PUT)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    const p = "Agenda/2026-07.md";

    const serverNew = mkSynced({ title: "服务器改的标题", etag: '"e2"' });
    const calls: PutCall[] = [];
    const source = fakeSource([serverNew], { status: 204, etag: '"unused"' }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.pulled).toBe(1);
    expect(calls).toHaveLength(0);
    const text = (await fs.read(p))!;
    expect(text).toContain("服务器改的标题");
    expect(text).toContain('etag:: "e2"');
  });

  it("resolves a conflict (both sides changed) as server-wins, without attempting a PUT", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/会议/g, "本地改的会议"));

    const serverNew = mkSynced({ title: "服务器改的标题", etag: '"e2"' });
    const calls: PutCall[] = [];
    const source = fakeSource([serverNew], { status: 204, etag: '"unused"' }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.conflicts).toBe(1);
    expect(calls).toHaveLength(0);
    const text = (await fs.read(p))!;
    expect(text).toContain("服务器改的标题");
    expect(text).not.toContain("本地改的会议");
    expect(msgs.some((m) => m.includes("冲突"))).toBe(true);
  });

  it("skips a local push on 412 (server-wins) without touching the local etag/base_hash", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/会议/g, "改过的会议"));
    const before = await fs.read(p);

    const calls: PutCall[] = [];
    const source = fakeSource([mkSynced()], { status: 412 }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.pushed).toBe(0);
    expect(calls).toHaveLength(1);
    expect(await fs.read(p)).toBe(before);
    expect(msgs.some((m) => m.includes("跳过"))).toBe(true);
  });

  it("deletes the server copy when the local block was removed, and drops the local block/tracked state", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    await store.writeSyncState({ tracked: { "a@x": TRACKED_A_X } });
    const p = "Agenda/2026-07.md";
    // simulate the user deleting the whole block in Obsidian, leaving just the month heading
    const original = (await fs.read(p))!;
    await fs.write(p, original.replace(/\n\n## [\s\S]*/, "\n"));

    const calls: PutCall[] = [];
    const deleteCalls: DeleteCall[] = [];
    const source = fakeSource([mkSynced()], { status: 204, etag: '"e2"' }, calls, { status: 204 }, deleteCalls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.deleted).toBe(1);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].url).toBe("https://cal.example/home/a-x.ics");
    expect(deleteCalls[0].ifMatch).toBe('"e1"');
    expect(await fs.read(p)).not.toContain("uid:: a@x");
  });

  it("marks a server-deleted event without deleting it locally or losing prose", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    await store.writeSyncState({ tracked: { "a@x": TRACKED_A_X } });
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/\n$/, "") + "\n\n我的会前笔记\n");

    const calls: PutCall[] = [];
    const deleteCalls: DeleteCall[] = [];
    // server no longer has the event
    const source = fakeSource([], { status: 204, etag: '"e2"' }, calls, { status: 204 }, deleteCalls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.markedServerDeleted).toBe(1);
    expect(deleteCalls).toHaveLength(0);
    const text = (await fs.read(p))!;
    expect(text).toContain("uid:: a@x");
    expect(text).toContain("server_deleted:: true");
    expect(text).toContain("我的会前笔记");
  });

  it("seeds tracked state for an already-synced, unchanged event on its first D3 sync (no prior SyncState)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    // no SyncState has ever been written for this store — mirrors a vault that was
    // already synced under pre-D3 code, running its first sync after upgrading.

    const calls: PutCall[] = [];
    const source = fakeSource([mkSynced()], { status: 204, etag: '"unused"' }, calls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    // a true no-op round: nothing pushed, pulled, created, or conflicted
    expect(summary.pushed).toBe(0);
    expect(summary.pulled).toBe(0);
    expect(summary.created).toBe(0);
    expect(summary.conflicts).toBe(0);
    expect(calls).toHaveLength(0);

    const state = await store.readSyncState();
    expect(state.tracked["a@x"]).toEqual(TRACKED_A_X);
  });

  it("skips a delete on 412 (server-wins) without deleting the confirmed-gone uid or touching the file", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    await store.writeSyncState({ tracked: { "a@x": TRACKED_A_X } });
    const p = "Agenda/2026-07.md";
    const original = (await fs.read(p))!;
    await fs.write(p, original.replace(/\n\n## [\s\S]*/, "\n"));
    const before = await fs.read(p);

    const calls: PutCall[] = [];
    const deleteCalls: DeleteCall[] = [];
    const source = fakeSource([mkSynced()], { status: 204, etag: '"e2"' }, calls, { status: 412 }, deleteCalls);
    const msgs: string[] = [];

    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m));

    expect(summary.deleted).toBe(0);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].ifMatch).toBe('"e1"');
    expect(await fs.read(p)).toBe(before);
    expect(msgs.some((m) => m.includes("跳过"))).toBe(true);
  });

  it("retries a delete on the next sync after a 412, and never resurrects the locally-deleted event", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    await store.sync([mkSynced()]);
    await store.writeSyncState({ tracked: { "a@x": TRACKED_A_X } });
    const p = "Agenda/2026-07.md";
    await fs.write(p, (await fs.read(p))!.replace(/\n\n## [\s\S]*/, "\n"));

    // round 1: delete attempt gets 412 (server-wins skip-and-retry)
    const round1Deletes: DeleteCall[] = [];
    const round1 = fakeSource([mkSynced()], { status: 204 }, [], { status: 412 }, round1Deletes);
    await syncBidirectional(round1, CAL_URL, store, () => {});
    expect(round1Deletes).toHaveLength(1);

    // round 2: server still has it (delete never actually happened); the sync must retry
    // the delete, not treat the still-untracked-locally uid as a brand-new server event.
    const round2Deletes: DeleteCall[] = [];
    const round2 = fakeSource([mkSynced()], { status: 204 }, [], { status: 204 }, round2Deletes);
    const summary2 = await syncBidirectional(round2, CAL_URL, store, () => {});

    expect(round2Deletes).toHaveLength(1);
    expect(summary2.deleted).toBe(1);
    expect(summary2.pulled).toBe(0);
    expect(await fs.read(p)).not.toContain("uid:: a@x");
  });
});
