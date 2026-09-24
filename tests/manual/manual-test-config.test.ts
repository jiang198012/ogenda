import { describe, expect, it } from "vitest";
import { buildLaunchPlan } from "../../scripts/manual-test/launch-demo-vault.mjs";
import { laneCountForWidth, VIEWPORT_MATRIX } from "../../scripts/manual-test/viewport-matrix.mjs";

describe("demo-vault manual test launcher", () => {
  it("builds an explicit, inspectable Obsidian launch plan", () => {
    const plan = buildLaunchPlan({
      vaultPath: "/tmp/demo-vault",
      port: 9444,
      width: 420,
      height: 900,
      binary: "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
    });
    expect(plan.binary).toBe("/Applications/Obsidian.app/Contents/MacOS/Obsidian");
    expect(plan.args).toEqual([
      "--remote-debugging-port=9444",
      "--window-size=420,900",
      "--new-window",
      "--vault=/tmp/demo-vault",
    ]);
  });

  it("keeps the 1/3/7 lane boundaries explicit at every acceptance edge", () => {
    expect(VIEWPORT_MATRIX.map((item) => [item.width, item.lanes])).toEqual([
      [360, 1],
      [361, 3],
      [390, 3],
      [720, 3],
      [721, 7],
    ]);
    expect(laneCountForWidth(360)).toBe(1);
    expect(laneCountForWidth(361)).toBe(3);
    expect(laneCountForWidth(720)).toBe(3);
    expect(laneCountForWidth(721)).toBe(7);
    expect(laneCountForWidth(390)).toBe(3);
  });
});
