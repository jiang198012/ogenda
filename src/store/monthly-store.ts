import { AgendaEvent } from "../core/event";
import { upsertEvents } from "../core/monthly-doc";
import { FileStore } from "./file-store";

export function monthOf(startIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(startIso);
  return m ? `${m[1]}-${m[2]}` : "unknown";
}

export interface SyncSummary {
  added: number;
  updated: number;
  months: string[];
}

export class MonthlyStore {
  constructor(private store: FileStore, private folder: string) {}

  private pathFor(month: string): string {
    return `${this.folder}/${month}.md`;
  }

  async sync(events: AgendaEvent[]): Promise<SyncSummary> {
    const byMonth = new Map<string, AgendaEvent[]>();
    for (const ev of events) {
      const month = monthOf(ev.start);
      const list = byMonth.get(month) ?? [];
      list.push(ev);
      byMonth.set(month, list);
    }
    let added = 0;
    let updated = 0;
    const months: string[] = [];
    if (byMonth.size > 0) await this.store.ensureFolder(this.folder);
    for (const [month, monthEvents] of byMonth) {
      const path = this.pathFor(month);
      const existing = (await this.store.read(path)) ?? "";
      const seed = existing || `# ${month}\n`;
      const r = upsertEvents(seed, monthEvents);
      await this.store.write(path, r.text);
      added += r.added;
      updated += r.updated;
      months.push(month);
    }
    return { added, updated, months };
  }
}
