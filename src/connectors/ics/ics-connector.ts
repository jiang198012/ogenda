import { requestUrl } from "obsidian";
import { AgendaEvent } from "../../core/event";
import { icalToEvents } from "../../core/ical-map";
import { Connector, dedupeByUid } from "../connector";

export function normalizeIcsUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("webcal://")) return "https://" + u.slice("webcal://".length);
  return u;
}

/** Minimal GET result the connector needs (matches Obsidian requestUrl's shape). */
export type IcsFetch = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetch: IcsFetch = (url) => requestUrl({ url, method: "GET", throw: false });

export class IcsConnector implements Connector {
  id = "ics";
  private url: string;
  constructor(url: string, private doFetch: IcsFetch = defaultFetch) {
    this.url = normalizeIcsUrl(url);
  }
  async fetch(): Promise<AgendaEvent[]> {
    const res = await this.doFetch(this.url);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ICS GET ${this.url} -> HTTP ${res.status}`);
    }
    return dedupeByUid(icalToEvents(res.text, "ics", "ics"));
  }
}
