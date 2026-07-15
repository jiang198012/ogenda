import { describe, it, expect } from "vitest";
import { parseMonthlyDoc, serializeMonthlyDoc } from "../../src/core/monthly-doc";

const doc = `# 2026-07

## 15:00–16:00 团队周会
- uid:: abc@x
- start:: 2026-07-14T15:00:00
- custom:: keep-me

我自己记的纪要,别动。
- [ ] 会前准备

## 09:00 晨会
- uid:: def@x
- start:: 2026-07-15T09:00:00
`;

describe("parseMonthlyDoc", () => {
  it("splits preamble + event blocks with fields and prose", () => {
    const { preamble, blocks } = parseMonthlyDoc(doc);
    expect(preamble).toBe("# 2026-07");
    expect(blocks.length).toBe(2);
    expect(blocks[0].heading).toBe("15:00–16:00 团队周会");
    expect(blocks[0].fields.uid).toBe("abc@x");
    expect(blocks[0].fields.custom).toBe("keep-me"); // 未知字段保留
    expect(blocks[0].prose).toContain("我自己记的纪要");
    expect(blocks[0].prose).toContain("- [ ] 会前准备");
    expect(blocks[1].fields.uid).toBe("def@x");
    expect(blocks[1].prose).toBe("");
  });
  it("round-trips: parse then serialize preserves content", () => {
    const { preamble, blocks } = parseMonthlyDoc(doc);
    const out = serializeMonthlyDoc(preamble, blocks);
    const again = parseMonthlyDoc(out);
    expect(again.blocks[0].fields.custom).toBe("keep-me");
    expect(again.blocks[0].prose).toContain("我自己记的纪要");
    expect(again.blocks.length).toBe(2);
  });
});
