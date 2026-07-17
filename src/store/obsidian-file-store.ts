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
    } else {
      await this.ensureParent(p);
      await this.vault.create(p, content);
    }
  }

  async ensureFolder(path: string): Promise<void> {
    const p = normalizePath(path);
    if (!(this.vault.getAbstractFileByPath(p) instanceof TFolder)) {
      await this.vault.createFolder(p).catch(() => {});
    }
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
