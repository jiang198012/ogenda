import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { FileStore } from "./file-store";

export class ObsidianFileStore implements FileStore {
  constructor(private vault: Vault) {}

  async read(path: string): Promise<string | null> {
    const p = normalizePath(path);
    const f = this.vault.getAbstractFileByPath(p);
    if (f instanceof TFile) return await this.vault.read(f);
    // the vault index never resolved .ogenda-sync-state.json even long after it was
    // written and confirmed present on disk (not a transient lag) — fall back to a
    // direct filesystem check rather than treating an unindexed file as absent.
    if (await this.vault.adapter.exists(p)) {
      return await this.vault.adapter.read(p);
    }
    return null;
  }

  async write(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const f = this.vault.getAbstractFileByPath(p);
    if (f instanceof TFile) {
      await this.vault.process(f, () => content);
      return;
    }
    await this.ensureParent(p);
    try {
      await this.vault.create(p, content);
    } catch {
      // the vault index never resolved .ogenda-sync-state.json (not a transient lag —
      // see the matching note in read()): create() throws "already exists" even though
      // getAbstractFileByPath() just returned null. Bypass the index and write straight
      // to disk instead of losing the write.
      await this.vault.adapter.write(p, content);
    }
  }

  async ensureFolder(path: string): Promise<void> {
    const p = normalizePath(path);
    if (!(this.vault.getAbstractFileByPath(p) instanceof TFolder)) {
      await this.vault.createFolder(p).catch(() => {});
    }
  }

  async list(folder: string): Promise<string[]> {
    const f = this.vault.getAbstractFileByPath(normalizePath(folder));
    if (!(f instanceof TFolder)) return [];
    return f.children.filter((c): c is TFile => c instanceof TFile).map((c) => c.path);
  }

  private async ensureParent(filePath: string): Promise<void> {
    const idx = filePath.lastIndexOf("/");
    if (idx <= 0) return;
    const parent = filePath.slice(0, idx);
    if (!(this.vault.getAbstractFileByPath(parent) instanceof TFolder)) {
      await this.vault.createFolder(parent).catch(() => {});
    }
  }
}
