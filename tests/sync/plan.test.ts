import { describe, it, expect } from "vitest";
import { AgendaEvent, eventToFields, hashEvent } from "../../src/core/event";
import { LocalEvent } from "../../src/store/monthly-store";
import { planSync } from "../../src/sync/plan";

const serverEvent = (o: Partial<AgendaEvent> = {}): AgendaEvent => ({
  uid: "a@x",
  title: "会议",
  start: "2026-07-14T15:00:00",
  origin: "synced",
  source: "caldav/icloud",
  protocol: "caldav",
  etag: '"e1"',
  href: "https://p1.example/cal/a.ics",
  ...o,
});

/** builds a LocalEvent whose base_hash matches ev's calendar fields (i.e. "unedited since last sync") */
function mkLocal(ev: AgendaEvent): LocalEvent {
  const fields = eventToFields({ ...ev, baseHash: hashEvent(ev) });
  return { uid: ev.uid, fields, prose: "我的笔记", hasHref: Boolean(fields.href) };
}

describe("planSync", () => {
  it("no-op when local is unedited and server etag is unchanged", () => {
    const s = serverEvent();
    const l = mkLocal(s);
    const plan = planSync([s], [l]);
    expect(plan.pushUpdate).toEqual([]);
    expect(plan.pushCreate).toEqual([]);
    expect(plan.applyServer).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("pushes local edit when local changed but server etag is unchanged", () => {
    const s = serverEvent();
    const l = mkLocal(s);
    l.fields.title = "改过的标题";
    const plan = planSync([s], [l]);
    expect(plan.pushUpdate).toHaveLength(1);
    expect(plan.pushUpdate[0]).toMatchObject({ uid: "a@x", title: "改过的标题", href: s.href, etag: s.etag });
    expect(plan.applyServer).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("preserves origin=synced on a pushUpdate (edited-in-Obsidian event still originated on the server)", () => {
    const s = serverEvent();
    const l = mkLocal(s);
    l.fields.title = "改过的标题";
    const plan = planSync([s], [l]);
    expect(plan.pushUpdate[0].origin).toBe("synced");
  });

  it("applies server version when server etag changed but local is unedited", () => {
    const l = mkLocal(serverEvent());
    const sNew = serverEvent({ title: "服务器改的标题", etag: '"e2"' });
    const plan = planSync([sNew], [l]);
    expect(plan.applyServer).toEqual([sNew]);
    expect(plan.pushUpdate).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });

  it("flags a conflict when both local and server changed since last sync", () => {
    const l = mkLocal(serverEvent());
    l.fields.title = "本地改的标题";
    const sNew = serverEvent({ title: "服务器改的标题", etag: '"e2"' });
    const plan = planSync([sNew], [l]);
    expect(plan.conflicts).toEqual([{ uid: "a@x", local: l, server: sNew }]);
    expect(plan.pushUpdate).toEqual([]);
    expect(plan.applyServer).toEqual([]);
  });

  it("pushes a local-only block with no href as a create", () => {
    const l: LocalEvent = {
      uid: "new@x",
      fields: { uid: "new@x", title: "新建的事件", start: "2026-07-20T10:00:00" },
      prose: "",
      hasHref: false,
    };
    const plan = planSync([], [l]);
    expect(plan.pushCreate).toHaveLength(1);
    expect(plan.pushCreate[0]).toMatchObject({ uid: "new@x", title: "新建的事件" });
    expect(plan.pushCreate[0].href).toBeUndefined();
  });

  it("applies a server-only event that has no local counterpart", () => {
    const s = serverEvent({ uid: "srv@x" });
    const plan = planSync([s], []);
    expect(plan.applyServer).toEqual([s]);
  });

  it("no-ops when a previously-synced local block's uid is absent from this server fetch (deletion propagation is D3)", () => {
    const l = mkLocal(serverEvent());
    const plan = planSync([], [l]);
    expect(plan.pushUpdate).toEqual([]);
    expect(plan.pushCreate).toEqual([]);
    expect(plan.applyServer).toEqual([]);
    expect(plan.conflicts).toEqual([]);
  });
});
