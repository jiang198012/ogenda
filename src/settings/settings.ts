export interface OgendaSettings {
  storageFolder: string;
  syncOnStartup: boolean;
  // --- iCloud CalDAV (D0 spike) ---
  icloudUser: string;
  icloudAppPassword: string;
  icloudCalUrl: string;
  /** IANA timezone name (e.g. "America/Los_Angeles"); empty = use the system timezone. */
  timezone: string;
  language: "auto" | "zh" | "en";
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  storageFolder: "Agenda",
  syncOnStartup: false,
  icloudUser: "",
  icloudAppPassword: "",
  icloudCalUrl: "",
  timezone: "",
  language: "auto",
};

export function sanitizeSettings(raw: unknown): OgendaSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const lang = (v: unknown): "auto" | "zh" | "en" => (v === "zh" || v === "en" ? v : "auto");
  return {
    storageFolder: str(r.storageFolder, DEFAULT_SETTINGS.storageFolder),
    syncOnStartup: bool(r.syncOnStartup, DEFAULT_SETTINGS.syncOnStartup),
    icloudUser: str(r.icloudUser, DEFAULT_SETTINGS.icloudUser),
    icloudAppPassword: str(r.icloudAppPassword, DEFAULT_SETTINGS.icloudAppPassword),
    icloudCalUrl: str(r.icloudCalUrl, DEFAULT_SETTINGS.icloudCalUrl),
    timezone: str(r.timezone, DEFAULT_SETTINGS.timezone),
    language: lang(r.language),
  };
}
