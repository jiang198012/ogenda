import { AgendaEvent } from "../core/event";
import { parseMonthlyDoc, upsertEvents } from "../core/monthly-doc";
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

/** A parsed local event block, as found in a monthly file (not yet reconciled with the server). */
export interface LocalEvent {
  uid: string;
  fields: Record<string, string>;
  prose: string;
  /** true if the block carries an href:: (was previously synced via CalDAV) */
  hasHref: boolean;
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
      // skip the write entirely when nothing changed (avoids churn + misleading "updated" counts)
      if (r.added > 0 || r.updated > 0) {
        await this.store.write(path, r.text);
        added += r.added;
        updated += r.updated;
        months.push(month);
      }
    }
    return { added, updated, months };
  }

  async readEvents(): Promise<LocalEvent[]> {
    const paths = await this.store.list(this.folder);
    const out: LocalEvent[] = [];
    for (const path of paths) {
      const text = await this.store.read(path);
      if (!text) continue;
      const { blocks } = parseMonthlyDoc(text);
      for (const b of blocks) {
        const uid = b.fields["uid"];
        if (!uid) continue;
        out.push({ uid, fields: b.fields, prose: b.prose, hasHref: Boolean(b.fields["href"]) });
      }
    }
    return out;
  }
}
