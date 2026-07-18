import { describe, it, expect } from "vitest";
import { generateUid } from "../../src/agenda-panel/uid";

describe("generateUid", () => {
  it("produces a uuid-shaped uid suffixed with @ogenda", () => {
    const uid = generateUid();
    expect(uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@ogenda$/);
  });

  it("produces a different uid on each call", () => {
    expect(generateUid()).not.toBe(generateUid());
  });
});
