import { describe, it, expect } from "vitest";
import { AgendaEvent } from "../../src/core/event";
import { nextDueReminder } from "../../src/agenda-panel/reminders";

const mk = (o: Partial<AgendaEvent>): AgendaEvent => ({
  uid: "e1", title: "会议", start: "2026-07-14T15:00:00", origin: "local", ...o,
});

// 2026-07-14 是周二
const NOW = "2026-07-14T09:00:00";

describe("nextDueReminder", () => {
  it("returns null when nothing has a reminder", () => {
    expect(nextDueReminder([mk({})], NOW)).toBeNull();
  });

  it("returns the earliest due reminder", () => {
    const soon = mk({ uid: "a", title: "早会", start: "2026-07-14T09:30:00", reminder: 10 });
    const later = mk({ uid: "b", title: "评审", start: "2026-07-14T14:00:00", reminder: 60 });
    expect(nextDueReminder([later, soon], NOW)).toEqual({
      uid: "a", title: "早会", start: "2026-07-14T09:30:00", due: "2026-07-14T09:20:00",
    });
  });

  it("considers every reminder on an event", () => {
    const ev = mk({ start: "2026-07-14T15:00:00", reminders: [1440, 60] });
    expect(nextDueReminder([ev], NOW)).toEqual({
      uid: "e1", title: "会议", start: "2026-07-14T15:00:00", due: "2026-07-14T14:00:00",
    });
  });

  it("skips reminders whose trigger point already passed", () => {
    const past = mk({ title: "过去的会", start: "2026-07-14T09:05:00", reminder: 15 }); // due 08:50 < now
    const ok = mk({ uid: "b", title: "下一个", start: "2026-07-14T10:00:00", reminder: 5 });
    expect(nextDueReminder([past, ok], NOW)?.uid).toBe("b");
  });

  it("skips events that already started", () => {
    const started = mk({ start: "2026-07-14T08:00:00", reminder: 0 });
    expect(nextDueReminder([started], NOW)).toBeNull();
  });

  it("computes the next occurrence for a recurring event", () => {
    const ev = mk({ rrule: "FREQ=WEEKLY;BYDAY=WE", reminder: 30 }); // 周三 15:00
    const r = nextDueReminder([ev], NOW);
    expect(r?.start).toBe("2026-07-15T15:00:00");
    expect(r?.due).toBe("2026-07-15T14:30:00");
  });

  it("ignores a recurring event whose next occurrence trigger is in the past", () => {
    // 每天 09:05,提醒 15 分钟:今天 09:05 的触发点 08:50 已过,但明天 09:05 还有效
    const ev = mk({ start: "2026-07-14T09:05:00", rrule: "FREQ=DAILY", reminder: 15 });
    const r = nextDueReminder([ev], NOW);
    expect(r?.start).toBe("2026-07-15T09:05:00");
  });

  it("returns null when every due point is in the past", () => {
    const ev = mk({ start: "2026-07-14T09:05:00", reminder: 15 });
    expect(nextDueReminder([ev], NOW)).toBeNull();
  });

  it("ignores invalid now", () => {
    expect(nextDueReminder([mk({ reminder: 5 })], "not-a-date")).toBeNull();
  });

  it("treats a 0-minute reminder as due at start time", () => {
    const ev = mk({ uid: "z", title: "准点", start: "2026-07-14T09:30:00", reminder: 0 });
    expect(nextDueReminder([ev], NOW)?.due).toBe("2026-07-14T09:30:00");
  });
});
