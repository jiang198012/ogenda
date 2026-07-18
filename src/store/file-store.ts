export interface FileStore {
  /** returns file content, or null if the file does not exist */
  read(path: string): Promise<string | null>;
  /** create the file if missing, otherwise overwrite */
  write(path: string, content: string): Promise<void>;
  /** create the folder (idempotent) */
  ensureFolder(path: string): Promise<void>;
  /** paths of files directly inside a folder (non-recursive); [] if the folder has none */
  list(folder: string): Promise<string[]>;
}

export class InMemoryFileStore implements FileStore {
  files = new Map<string, string>();
  folders = new Set<string>();
  async read(path: string): Promise<string | null> {
    return this.files.has(path) ? this.files.get(path)! : null;
  }
  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
  async list(folder: string): Promise<string[]> {
    const prefix = `${folder}/`;
    return [...this.files.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"));
  }
}
