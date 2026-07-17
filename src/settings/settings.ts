export interface OgendaSettings {
  email: string;
  /** Gmail app password, stored in plaintext in data.json (user-accepted tradeoff). */
  appPassword: string;
  storageFolder: string;
  scanCount: number;
  syncOnStartup: boolean;
  // --- iCloud CalDAV (D0 spike) ---
  icloudUser: string;
  icloudAppPassword: string;
  icloudCalUrl: string;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  email: "",
  appPassword: "",
  storageFolder: "Agenda",
  scanCount: 50,
  syncOnStartup: false,
  icloudUser: "",
  icloudAppPassword: "",
  icloudCalUrl: "",
};

export function sanitizeSettings(raw: unknown): OgendaSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    email: str(r.email, DEFAULT_SETTINGS.email),
    appPassword: str(r.appPassword, DEFAULT_SETTINGS.appPassword),
    storageFolder: str(r.storageFolder, DEFAULT_SETTINGS.storageFolder),
    scanCount: num(r.scanCount, DEFAULT_SETTINGS.scanCount),
    syncOnStartup: bool(r.syncOnStartup, DEFAULT_SETTINGS.syncOnStartup),
    icloudUser: str(r.icloudUser, DEFAULT_SETTINGS.icloudUser),
    icloudAppPassword: str(r.icloudAppPassword, DEFAULT_SETTINGS.icloudAppPassword),
    icloudCalUrl: str(r.icloudCalUrl, DEFAULT_SETTINGS.icloudCalUrl),
  };
}
