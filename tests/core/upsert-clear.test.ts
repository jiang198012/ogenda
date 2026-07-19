import { describe, it, expect } from "vitest";
import { upsertEvents } from "../../src/core/monthly-doc";
import { AgendaEvent } from "../../src/core/event";

const base: AgendaEvent = { uid: "e1@ogenda", title: "会", start: "2026-07-14T10:00:00", origin: "local" };

describe("upsertEvents clearFields (#53)", () => {
  it("without clearFields, a now-absent optional field is PRESERVED (sync merge semantics)", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, location: "会议室" }]).text;
    const after = upsertEvents(seed, [{ ...base }]).text; // location dropped from the event
    expect(after).toContain("location:: 会议室"); // merge never deletes
  });

  it("with clearFields, a now-absent clearable field is DELETED from the block", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, location: "会议室" }]).text;
    const r = upsertEvents(seed, [{ ...base }], { clearFields: ["location"] });
    expect(r.text).not.toContain("会议室");
    expect(r.updated).toBe(1);
  });

  it("with clearFields, a metadata field NOT in the clearable set is preserved", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base, href: "https://x/a.ics", location: "会议室" }]).text;
    const r = upsertEvents(seed, [{ ...base, href: "https://x/a.ics" }], { clearFields: ["location"] });
    expect(r.text).toContain("href:: https://x/a.ics"); // preserved
    expect(r.text).not.toContain("会议室"); // cleared
  });

  it("counts 0 updated when there is nothing to clear and nothing changed", () => {
    const seed = upsertEvents("# 2026-07\n", [{ ...base }]).text;
    const r = upsertEvents(seed, [{ ...base }], { clearFields: ["location"] });
    expect(r.updated).toBe(0);
  });
});
