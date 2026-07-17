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
