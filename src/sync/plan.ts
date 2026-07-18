import { AgendaEvent, hashEvent } from "../core/event";
import { LocalEvent } from "../store/monthly-store";

export interface SyncConflict {
  uid: string;
  local: LocalEvent;
  server: AgendaEvent;
}

export interface SyncPlan {
  pushUpdate: AgendaEvent[];
  pushCreate: AgendaEvent[];
  applyServer: AgendaEvent[];
  conflicts: SyncConflict[];
}

/** Reconstructs the calendar-writable fields (+ sync metadata) of an AgendaEvent from a monthly-doc block. */
function fieldsToEvent(fields: Record<string, string>): AgendaEvent {
  return {
    uid: fields["uid"] ?? "",
    title: fields["title"] ?? "",
    start: fields["start"] ?? "",
    end: fields["end"],
    allDay: fields["all_day"] === undefined ? undefined : fields["all_day"] === "true",
    tz: fields["tz"],
    location: fields["location"],
    origin: fields["origin"] === "synced" ? "synced" : "local",
    href: fields["href"],
    etag: fields["etag"],
    baseHash: fields["base_hash"],
  };
}

/**
 * Three-way diff (spec §6): local hash vs base_hash detects local edits;
 * server etag vs the locally-recorded etag detects server-side changes.
 * Deletion propagation (local block removed, or server no longer has a
 * previously-synced uid) is out of scope for D2 — see D3.
 */
export function planSync(server: AgendaEvent[], local: LocalEvent[]): SyncPlan {
  const serverByUid = new Map(server.map((s) => [s.uid, s]));
  const localUids = new Set(local.map((l) => l.uid));

  const pushUpdate: AgendaEvent[] = [];
  const pushCreate: AgendaEvent[] = [];
  const applyServer: AgendaEvent[] = [];
  const conflicts: SyncConflict[] = [];

  for (const l of local) {
    if (!l.hasHref) {
      pushCreate.push(fieldsToEvent(l.fields));
      continue;
    }
    const s = serverByUid.get(l.uid);
    if (!s) continue; // previously synced, but this fetch has no matching uid — not a D2 concern

    const localChanged = hashEvent(fieldsToEvent(l.fields)) !== (l.fields["base_hash"] ?? "");
    const serverChanged = s.etag !== l.fields["etag"];

    if (localChanged && serverChanged) {
      conflicts.push({ uid: l.uid, local: l, server: s });
    } else if (localChanged) {
      pushUpdate.push(fieldsToEvent(l.fields));
    } else if (serverChanged) {
      applyServer.push(s);
    }
  }

  for (const s of server) {
    if (!localUids.has(s.uid)) applyServer.push(s);
  }

  return { pushUpdate, pushCreate, applyServer, conflicts };
}
