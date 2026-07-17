import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { dedupeByUid } from "../../src/connectors/connector";

const mk = (uid: string, title: string): AgendaEvent => ({
  uid, title, start: "2026-07-14T15:00:00", origin: "synced", source: "s", protocol: "imap",
});

describe("dedupeByUid", () => {
  it("keeps one event per uid (last wins), drops uid-less", () => {
    const r = dedupeByUid([mk("a", "one"), mk("a", "two"), mk("b", "three")]);
    expect(r.length).toBe(2);
    expect(r.find((e) => e.uid === "a")!.title).toBe("two");
  });

  it("drops events with empty/missing uid", () => {
    const r = dedupeByUid([mk("a", "one"), mk("", "no-uid")]);
    expect(r.length).toBe(1);
    expect(r[0].uid).toBe("a");
  });
});
