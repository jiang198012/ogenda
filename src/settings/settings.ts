export interface OgendaSettings {
  email: string;
  storageFolder: string;
  scanCount: number;
  syncOnStartup: boolean;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  email: "",
  storageFolder: "Agenda",
  scanCount: 50,
  syncOnStartup: false,
};

export function sanitizeSettings(raw: unknown): OgendaSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    email: str(r.email, DEFAULT_SETTINGS.email),
    storageFolder: str(r.storageFolder, DEFAULT_SETTINGS.storageFolder),
    scanCount: num(r.scanCount, DEFAULT_SETTINGS.scanCount),
    syncOnStartup: bool(r.syncOnStartup, DEFAULT_SETTINGS.syncOnStartup),
  };
}
