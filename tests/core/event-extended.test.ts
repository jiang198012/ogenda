import { describe, it, expect } from "vitest";
import { AgendaEvent, eventToFields, hashEvent } from "../../src/core/event";
import { fieldsToEvent } from "../../src/sync/plan";
import { localToEvent } from "../../src/agenda-panel/local-to-event";

const base = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1", title: "周会", start: "2026-07-17T10:00:00", end: "2026-07-17T11:00:00", origin: "local", ...o,
});

describe("eventToFields / fieldsToEvent — reminder & exdates", () => {
  it("round-trips reminder and exdates through the md field layer", () => {
    const ev = base({ reminder: 15, exdates: ["2026-07-24T10:00:00", "2026-07-31T10:00:00"] });
    const back = fieldsToEvent(eventToFields(ev));
    expect(back.reminder).toBe(15);
    expect(back.exdates).toEqual(["2026-07-24T10:00:00", "2026-07-31T10:00:00"]);
  });

  it("omits reminder/exdates fields when unset", () => {
    const f = eventToFields(base({}));
    expect(f["reminder"]).toBeUndefined();
    expect(f["exdates"]).toBeUndefined();
  });

  it("tolerates a malformed reminder value", () => {
    const back = fieldsToEvent({ uid: "u", title: "x", start: "2026-07-17", reminder: "abc" });
    expect(back.reminder).toBeUndefined();
  });

  it("localToEvent maps reminder and exdates too", () => {
    const local = {
      uid: "u1",
      fields: {
        uid: "u1", title: "x", start: "2026-07-17T10:00:00", reminder: "10",
        exdates: "2026-07-24T10:00:00, 2026-07-31T10:00:00",
      },
      prose: "",
      hasHref: false,
    };
    const ev = localToEvent(local);
    expect(ev.reminder).toBe(10);
    expect(ev.exdates).toEqual(["2026-07-24T10:00:00", "2026-07-31T10:00:00"]);
  });
});

describe("hashEvent — reminder & exdates participate in change detection", () => {
  it("changes the hash when a reminder is added", () => {
    expect(hashEvent(base({}))).not.toBe(hashEvent(base({ reminder: 15 })));
  });

  it("changes the hash when exdates change", () => {
    expect(hashEvent(base({ exdates: ["2026-07-24T10:00:00"] }))).not.toBe(
      hashEvent(base({ exdates: ["2026-07-24T10:00:00", "2026-07-31T10:00:00"] })),
    );
  });

  it("stays byte-compatible with the pre-extension hash when both are unset", () => {
    // 与旧算法(无 reminder/exdates 项)对同一事件产生相同 hash —— 避免升级后全量重推
    const ev = base({});
    const canon = [ev.title, ev.start, ev.end ?? "", ev.allDay === undefined ? "" : String(ev.allDay), ev.location ?? ""];
    const joined = canon.join("\0");
    let h = 0x811c9dc5;
    for (let i = 0; i < joined.length; i++) {
      h ^= joined.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    expect(hashEvent(ev)).toBe((h >>> 0).toString(16));
  });
});
