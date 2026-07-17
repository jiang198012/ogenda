import { describe, it, expect } from "vitest";
import { InMemoryFileStore } from "../../src/store/file-store";

describe("InMemoryFileStore", () => {
  it("read of missing file returns null; write then read round-trips; overwrite works", async () => {
    const fs = new InMemoryFileStore();
    expect(await fs.read("Agenda/2026-07.md")).toBeNull();
    await fs.write("Agenda/2026-07.md", "hello");
    expect(await fs.read("Agenda/2026-07.md")).toBe("hello");
    await fs.write("Agenda/2026-07.md", "world");
    expect(await fs.read("Agenda/2026-07.md")).toBe("world");
  });
});
