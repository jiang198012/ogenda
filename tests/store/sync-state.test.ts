import { describe, it, expect } from "vitest";
import { InMemoryFileStore } from "../../src/store/file-store";
import { readSyncState, writeSyncState, SyncState } from "../../src/store/sync-state";

describe("SyncState read/write", () => {
  it("write then read round-trips the same SyncState", async () => {
    const fs = new InMemoryFileStore();
    const folder = "Agenda";
    const state: SyncState = {
      tracked: {
        "a@x": { href: "https://cal.example/a.ics", etag: '"abc123"' },
        "b@x": { href: "https://cal.example/b.ics", etag: '"def456"' },
      },
    };

    await writeSyncState(fs, folder, state);
    const read = await readSyncState(fs, folder);

    expect(read).toEqual(state);
  });

  it("reading a folder where the state file does not exist returns { tracked: {} }", async () => {
    const fs = new InMemoryFileStore();
    const state = await readSyncState(fs, "MissingFolder");
    expect(state).toEqual({ tracked: {} });
  });

  it("reading a file whose content is not valid JSON returns { tracked: {} }, does not throw", async () => {
    const fs = new InMemoryFileStore();
    const folder = "Agenda";
    await fs.write(`${folder}/.ogenda-sync-state.json`, "{ invalid json");

    const state = await readSyncState(fs, folder);
    expect(state).toEqual({ tracked: {} });
  });
});
