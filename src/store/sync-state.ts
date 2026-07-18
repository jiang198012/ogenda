import { FileStore } from "./file-store";

export interface SyncState {
  tracked: Record<string, { href: string; etag: string }>;
}

export async function readSyncState(
  store: FileStore,
  folder: string
): Promise<SyncState> {
  const path = `${folder}/.ogenda-sync-state.json`;
  const content = await store.read(path);

  if (!content) {
    return { tracked: {} };
  }

  try {
    return JSON.parse(content);
  } catch {
    return { tracked: {} };
  }
}

export async function writeSyncState(
  store: FileStore,
  folder: string,
  state: SyncState
): Promise<void> {
  const path = `${folder}/.ogenda-sync-state.json`;
  const content = JSON.stringify(state, null, 2);
  await store.write(path, content);
}
