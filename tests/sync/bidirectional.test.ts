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

function fakeSource(server: AgendaEvent[], putStatus: { status: number; etag?: string }, calls: PutCall[]): CalDavSource {
  return {
    fetch: async () => server,
    putEvent: async (url, ics, ifMatch) => {
      calls.push({ url, ics, ifMatch });
      return putStatus;
    },
  };
}

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
});
