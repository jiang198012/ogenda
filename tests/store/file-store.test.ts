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
  it("list returns paths of files directly inside a folder, not nested or unrelated ones", async () => {
    const fs = new InMemoryFileStore();
    await fs.write("Agenda/2026-07.md", "a");
    await fs.write("Agenda/2026-08.md", "b");
    await fs.write("Agenda/sub/2026-09.md", "c");
    await fs.write("Other/2026-07.md", "d");
    expect((await fs.list("Agenda")).sort()).toEqual(["Agenda/2026-07.md", "Agenda/2026-08.md"]);
  });
  it("list of a folder with no files returns empty array", async () => {
    const fs = new InMemoryFileStore();
    expect(await fs.list("Agenda")).toEqual([]);
  });
});
