import { AgendaEvent } from "../core/event";

export interface Connector {
  id: string;
  fetch(): Promise<AgendaEvent[]>;
}

export function dedupeByUid(events: AgendaEvent[]): AgendaEvent[] {
  const seen = new Map<string, AgendaEvent>();
  for (const e of events) {
    if (e.uid) seen.set(e.uid, e);
  }
  return [...seen.values()];
}
