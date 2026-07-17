import { EncryptedSecret, isEncryptedSecret } from "./secret-store";

export interface OgendaSettings {
  email: string;
  storageFolder: string;
  scanCount: number;
  syncOnStartup: boolean;
  /** Passphrase-encrypted Gmail app password (ciphertext only; safe to persist). */
  encryptedPassword: EncryptedSecret | null;
}

export const DEFAULT_SETTINGS: OgendaSettings = {
  email: "",
  storageFolder: "Agenda",
  scanCount: 50,
  syncOnStartup: false,
  encryptedPassword: null,
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
    // only the ciphertext is ever kept; a plaintext appPassword key is dropped here
    encryptedPassword: isEncryptedSecret(r.encryptedPassword) ? r.encryptedPassword : null,
  };
}
