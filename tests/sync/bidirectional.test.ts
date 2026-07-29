import { describe, it, expect, beforeEach } from "vitest";
import { AgendaEvent, hashEvent } from "../../src/core/event";
import { InMemoryFileStore } from "../../src/store/file-store";
import { MonthlyStore } from "../../src/store/monthly-store";
import { CalDavSource, syncBidirectional } from "../../src/sync/bidirectional";
import { setLanguage } from "../../src/i18n";

const CAL_URL = "https://cal.example/home";

beforeEach(() => setLanguage("zh"));

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

  it("isolates a throwing PUT and still persists the round's other successes", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    await fs.write(
      p,
      "# 2026-07\n\n## 甲\n- uid:: ok1\n- title:: 甲\n- start:: 2026-07-15T10:00:00\n\n## 炸\n- uid:: boom\n- title:: 炸\n- start:: 2026-07-15T11:00:00\n\n## 乙\n- uid:: ok2\n- title:: 乙\n- start:: 2026-07-15T12:00:00\n",
    );

    // old behavior: the throw aborted the whole round and ok1's href was never written.
    const source: CalDavSource = {
      fetch: async () => [],
      putEvent: async (url) => {
        if (url.includes("boom")) throw new Error("network down");
        return { status: 201, etag: '"c1"' };
      },
      deleteEvent: async () => ({ status: 204 }),
    };
    const msgs: string[] = [];
    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m), {
      sleep: async () => {},
      flushEvery: 1,
    });

    expect(summary.created).toBe(2);
    const text = (await fs.read(p))!;
    expect(text).toContain("href:: https://cal.example/home/ok1.ics");
    expect(text).toContain("href:: https://cal.example/home/ok2.ics");
    expect(text).not.toContain("href:: https://cal.example/home/boom.ics");
    expect(text).toContain("uid:: boom"); // untouched block — retried next round
    expect(msgs.some((m) => m.includes("network down"))).toBe(true);
  });

  it("caps creates per round and reports the backlog for later rounds", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    const block = (i: number) =>
      `## 会${i}\n- uid:: cap${i}\n- title:: 会${i}\n- start:: 2026-07-15T1${i}:00:00\n`;
    await fs.write(p, "# 2026-07\n\n" + [0, 1, 2, 3, 4].map(block).join("\n"));

    const calls: PutCall[] = [];
    const source = fakeSource([], { status: 201, etag: '"c1"' }, calls);
    const msgs: string[] = [];
    const summary = await syncBidirectional(source, CAL_URL, store, (m) => msgs.push(m), {
      sleep: async () => {},
      maxCreatesPerRound: 2,
    });

    expect(summary.created).toBe(2);
    expect(summary.createBacklog).toBe(3);
    expect(calls).toHaveLength(2);
    expect(msgs.some((m) => m.includes("剩余 3"))).toBe(true);

    const text = (await fs.read(p))!;
    expect(text).toContain("href:: https://cal.example/home/cap0.ics");
    expect(text).toContain("href:: https://cal.example/home/cap1.ics");
    expect(text).not.toContain("href:: https://cal.example/home/cap2.ics");
  });

  it("retries a 503 create with backoff and records the success", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    await fs.write(p, "# 2026-07\n\n## 会\n- uid:: r1\n- title:: 会\n- start:: 2026-07-15T10:00:00\n");

    let attempts = 0;
    const source: CalDavSource = {
      fetch: async () => [],
      putEvent: async () => (++attempts === 1 ? { status: 503 } : { status: 201, etag: '"c1"' }),
      deleteEvent: async () => ({ status: 204 }),
    };
    const sleeps: number[] = [];
    const summary = await syncBidirectional(source, CAL_URL, store, () => {}, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(summary.created).toBe(1);
    expect(attempts).toBe(2);
    expect(sleeps).toContain(2000); // first backoff delay
    expect((await fs.read(p))!).toContain("href:: https://cal.example/home/r1.ics");
  });

  it("paces server writes (sleep between requests, none before the first)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    const block = (i: number) => `## 会${i}\n- uid:: pace${i}\n- title:: 会${i}\n- start:: 2026-07-15T1${i}:00:00\n`;
    await fs.write(p, "# 2026-07\n\n" + [0, 1, 2].map(block).join("\n"));

    const calls: PutCall[] = [];
    const source = fakeSource([], { status: 201, etag: '"c1"' }, calls);
    const sleeps: number[] = [];
    await syncBidirectional(source, CAL_URL, store, () => {}, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      paceMs: 250,
      retry503Delays: [],
    });

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([250, 250]); // before writes 2 and 3 only
  });

  it("adopts server href/etag for a no-href block already on the server (no PUT, prose kept, no-op next round)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    await fs.write(
      p,
      "# 2026-07\n\n## 老会\n- uid:: old1\n- title:: 老会\n- start:: 2026-07-15T15:00:00\n- origin:: imported\n\n我手写的备注\n",
    );

    const s = mkSynced({
      uid: "old1",
      title: "老会",
      start: "2026-07-15T15:00:00",
      href: "https://cal.example/home/old1.ics",
      etag: '"srv1"',
    });
    const calls: PutCall[] = [];
    const source = fakeSource([s], { status: 201, etag: '"unused"' }, calls);
    const summary = await syncBidirectional(source, CAL_URL, store, () => {}, { sleep: async () => {} });

    expect(summary.adopted).toBe(1);
    expect(summary.created).toBe(0);
    expect(summary.pushed).toBe(0);
    expect(calls).toHaveLength(0); // adoption writes nothing to the server

    const text = (await fs.read(p))!;
    expect(text).toContain("href:: https://cal.example/home/old1.ics");
    expect(text).toContain('etag:: "srv1"');
    expect(text).toContain("origin:: synced");
    expect(text).toContain("我手写的备注"); // prose survives

    const state = await store.readSyncState();
    expect(state.tracked["old1"]).toEqual({ href: "https://cal.example/home/old1.ics", etag: '"srv1"' });

    // base_hash is the server event's hash and content matches → next round is a true no-op
    const calls2: PutCall[] = [];
    const summary2 = await syncBidirectional(
      fakeSource([s], { status: 201 }, calls2),
      CAL_URL,
      store,
      () => {},
      { sleep: async () => {} },
    );
    expect(summary2.pushed).toBe(0);
    expect(summary2.pulled).toBe(0);
    expect(summary2.adopted).toBe(0);
    expect(summary2.conflicts).toBe(0);
    expect(calls2).toHaveLength(0);
  });

  it("after adoption, a divergent local block pushes its content over the server's (local wins)", async () => {
    const fs = new InMemoryFileStore();
    const store = new MonthlyStore(fs, "Agenda");
    const p = "Agenda/2026-07.md";
    // local block title differs from the server copy of the same uid
    await fs.write(
      p,
      "# 2026-07\n\n## 本地权威标题\n- uid:: old2\n- title:: 本地权威标题\n- start:: 2026-07-15T15:00:00\n",
    );

    const s = mkSynced({
      uid: "old2",
      title: "服务器旧标题",
      start: "2026-07-15T15:00:00",
      href: "https://cal.example/home/old2.ics",
      etag: '"srv1"',
    });

    // round 1: adopt only — no write to the server
    const round1Calls: PutCall[] = [];
    const r1 = await syncBidirectional(
      fakeSource([s], { status: 204, etag: '"srv2"' }, round1Calls),
      CAL_URL,
      store,
      () => {},
      { sleep: async () => {} },
    );
    expect(r1.adopted).toBe(1);
    expect(round1Calls).toHaveLength(0);

    // round 2: local content differs from the server-hash baseline → pushUpdate, local wins
    const round2Calls: PutCall[] = [];
    const r2 = await syncBidirectional(
      fakeSource([s], { status: 204, etag: '"srv2"' }, round2Calls),
      CAL_URL,
      store,
      () => {},
      { sleep: async () => {} },
    );
    expect(r2.pushed).toBe(1);
    expect(round2Calls).toHaveLength(1);
    expect(round2Calls[0].ics).toContain("本地权威标题");
    expect(round2Calls[0].ifMatch).toBe('"srv1"');
  });
});
