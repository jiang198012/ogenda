import { OgendaSettings } from "../settings/settings";

export type SyncResolution =
  | { provider: "none" }
  | { provider: "incomplete"; which: "icloud" | "caldav" | "ics" }
  | { provider: "icloud" | "caldav"; user: string; pass: string; calUrl: string }
  | { provider: "ics"; url: string };

type SyncSettings = Pick<
  OgendaSettings,
  | "syncProvider"
  | "icloudUser"
  | "icloudAppPassword"
  | "icloudCalUrl"
  | "caldavUrl"
  | "caldavUser"
  | "caldavPass"
  | "icsUrl"
>;

export function resolveSyncProvider(s: SyncSettings): SyncResolution {
  switch (s.syncProvider) {
    case "icloud":
      if (s.icloudUser && s.icloudAppPassword && s.icloudCalUrl) {
        return { provider: "icloud", user: s.icloudUser, pass: s.icloudAppPassword, calUrl: s.icloudCalUrl };
      }
      return { provider: "incomplete", which: "icloud" };
    case "caldav":
      if (s.caldavUrl && s.caldavUser && s.caldavPass) {
        return { provider: "caldav", user: s.caldavUser, pass: s.caldavPass, calUrl: s.caldavUrl };
      }
      return { provider: "incomplete", which: "caldav" };
    case "ics":
      if (s.icsUrl) return { provider: "ics", url: s.icsUrl };
      return { provider: "incomplete", which: "ics" };
    default:
      return { provider: "none" };
  }
}
