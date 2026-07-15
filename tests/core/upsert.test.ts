import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { upsertEvents, parseMonthlyDoc } from "../../src/core/monthly-doc";

const mk = (uid: string, start: string, title: string): AgendaEvent => ({
  uid, title, start, origin: "synced", source: "imap/gmail", protocol: "imap",
});

describe("upsertEvents", () => {
  it("adds a new event into empty doc", () => {
    const r = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(0);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.uid).toBe("a@x");
    expect(blocks[0].heading).toContain("周会");
  });

  it("is idempotent by uid (no duplicate)", () => {
    const one = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]).text;
    const two = upsertEvents(one, [mk("a@x", "2026-07-14T15:00:00", "周会")]);
    expect(two.added).toBe(0);
    expect(two.updated).toBe(1);
    expect(parseMonthlyDoc(two.text).blocks.length).toBe(1);
  });

  it("updates machine fields but NEVER touches user prose", () => {
    let text = upsertEvents("", [mk("a@x", "2026-07-14T15:00:00", "周会")]).text;
    // 用户在事件下加散文
    text = text.replace(/\n$/, "") + "\n\n我的纪要:讨论了X。\n";
    // 标题变更 + 新增 location 的再同步
    const changed: AgendaEvent = { ...mk("a@x", "2026-07-14T15:00:00", "周会(改)"), location: "会议室B" };
    const r = upsertEvents(text, [changed]);
    expect(r.updated).toBe(1);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.location).toBe("会议室B");
    expect(blocks[0].heading).toContain("周会(改)");
    expect(blocks[0].prose).toContain("我的纪要:讨论了X");
  });

  it("sorts events chronologically by start", () => {
    const r = upsertEvents("", [
      mk("b@x", "2026-07-20T09:00:00", "晚的"),
      mk("a@x", "2026-07-14T15:00:00", "早的"),
    ]);
    const { blocks } = parseMonthlyDoc(r.text);
    expect(blocks[0].fields.uid).toBe("a@x");
    expect(blocks[1].fields.uid).toBe("b@x");
  });
});
