export interface OgendaSettings {
  storageFolder: string;
  syncOnStartup: boolean;
  // --- iCloud CalDAV (D0 spike) ---
  icloudUser: string;
  icloudAppPassword: string;
  icloudCalUrl: string;
  syncProvider: "none" | "icloud" | "caldav" | "ics";
  caldavUrl: string;
  caldavUser: string;
  caldavPass: string;
  icsUrl: string;
  /** IANA timezone name (e.g. "America/Los_Angeles"); empty = use the system timezone. */
  timezone: string;
  language: "auto" | "zh" | "en";
  /** Default category for new events; empty means fall back to the language-aware default. */
  defaultCategory: string;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  storageFolder: "Agenda",
  syncOnStartup: false,
  icloudUser: "",
  icloudAppPassword: "",
  icloudCalUrl: "",
  syncProvider: "none",
  caldavUrl: "",
  caldavUser: "",
  caldavPass: "",
  icsUrl: "",
  timezone: "",
  language: "auto",
  defaultCategory: "",
};

export function sanitizeSettings(raw: unknown): OgendaSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const lang = (v: unknown): "auto" | "zh" | "en" => (v === "zh" || v === "en" ? v : "auto");
  const provider = (v: unknown): OgendaSettings["syncProvider"] =>
    v === "icloud" || v === "caldav" || v === "ics" ? v : "none";
  return {
    storageFolder: str(r.storageFolder, DEFAULT_SETTINGS.storageFolder),
    syncOnStartup: bool(r.syncOnStartup, DEFAULT_SETTINGS.syncOnStartup),
    icloudUser: str(r.icloudUser, DEFAULT_SETTINGS.icloudUser),
    icloudAppPassword: str(r.icloudAppPassword, DEFAULT_SETTINGS.icloudAppPassword),
    icloudCalUrl: str(r.icloudCalUrl, DEFAULT_SETTINGS.icloudCalUrl),
    syncProvider: provider(r.syncProvider),
    caldavUrl: str(r.caldavUrl, ""),
    caldavUser: str(r.caldavUser, ""),
    caldavPass: str(r.caldavPass, ""),
    icsUrl: str(r.icsUrl, ""),
    timezone: str(r.timezone, DEFAULT_SETTINGS.timezone),
    language: lang(r.language),
    defaultCategory: str(r.defaultCategory, DEFAULT_SETTINGS.defaultCategory),
  };
}
