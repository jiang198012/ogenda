import { AgendaEvent } from "../core/event";
import { parseMonthlyDoc, serializeMonthlyDoc, upsertEvents } from "../core/monthly-doc";
import { FileStore } from "./file-store";
import { SyncState, readSyncState as readSyncStateFile, writeSyncState as writeSyncStateFile } from "./sync-state";

export function monthOf(startIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(startIso);
  return m ? `${m[1]}-${m[2]}` : "unknown";
}

/** Optional fields the panel edit form owns — blanking one should delete it. Metadata is never here. */
const PANEL_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "rsvp", "category", "tags", "description"];

/**
 * Server-authoritative optional fields: when a synced server event no longer carries one,
 * the local md field is deleted on apply (otherwise the stale value's hash would differ from
 * the server-based base_hash and ogenda would "push the ghost back", fighting other devices).
 * Local-only fields (rsvp/tags) and ALL sync metadata (etag/href/base_hash/...) are never here.
 */
const SYNC_CLEARABLE_FIELDS = ["end", "location", "organizer", "attendees", "status", "category", "description", "rrule"];

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
      const r = upsertEvents(seed, monthEvents, { clearFields: SYNC_CLEARABLE_FIELDS });
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

  async readSyncState(): Promise<SyncState> {
    return readSyncStateFile(this.store, this.folder);
  }

  async writeSyncState(state: SyncState): Promise<void> {
    return writeSyncStateFile(this.store, this.folder, state);
  }

  /**
   * Panel-edit write path: like sync() for a single event, but blanked optional
   * fields are DELETED (clearFields). Sync's merge semantics (which protect
   * href/etag/base_hash) are intentionally left untouched — see upsertEvents.
   */
  async savePanelEvent(event: AgendaEvent): Promise<SyncSummary> {
    await this.store.ensureFolder(this.folder);
    const month = monthOf(event.start);
    const path = this.pathFor(month);
    const existing = (await this.store.read(path)) ?? "";
    const seed = existing || `# ${month}\n`;
    const r = upsertEvents(seed, [event], { clearFields: PANEL_CLEARABLE_FIELDS });
    if (r.added > 0 || r.updated > 0) {
      await this.store.write(path, r.text);
    }
    return { added: r.added, updated: r.updated, months: r.added > 0 || r.updated > 0 ? [month] : [] };
  }

  /** Removes event blocks matching the given uids from whichever monthly files contain them. */
  async removeByUid(uids: string[]): Promise<void> {
    if (uids.length === 0) return;
    const uidSet = new Set(uids);
    const paths = await this.store.list(this.folder);
    for (const path of paths) {
      const text = await this.store.read(path);
      if (!text) continue;
      const { preamble, blocks } = parseMonthlyDoc(text);
      const remaining = blocks.filter((b) => !uidSet.has(b.fields["uid"]));
      // skip the write entirely when no block in this file matched (avoids churn)
      if (remaining.length === blocks.length) continue;
      await this.store.write(path, serializeMonthlyDoc(preamble, remaining));
    }
  }
}
