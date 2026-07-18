import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { FileStore } from "./file-store";

export class ObsidianFileStore implements FileStore {
  constructor(private vault: Vault) {}

  async read(path: string): Promise<string | null> {
    const f = this.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) return await this.vault.read(f);
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
      // vault's in-memory index can lag a file that already exists on disk
      // (seen with .ogenda-sync-state.json, D3): create() throws "already
      // exists" even though getAbstractFileByPath() just returned null, and
      // the lag persists across an immediate re-check. Bypass the index and
      // write straight to disk instead of losing the write.
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
