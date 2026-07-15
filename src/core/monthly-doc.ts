import { AgendaEvent, eventToFields } from "./event";

export interface EventBlock {
  heading: string;
  fields: Record<string, string>;
  fieldOrder: string[];
  prose: string;
}

const HEADING_RE = /^##\s+(.*)$/;
const FIELD_RE = /^-\s+([A-Za-z0-9_]+)::\s?(.*)$/;

export function parseMonthlyDoc(text: string): { preamble: string; blocks: EventBlock[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: EventBlock[] = [];
  const preambleLines: string[] = [];
  let cur:
    | { heading: string; fieldOrder: string[]; fields: Record<string, string>; proseLines: string[]; inFields: boolean }
    | null = null;

  const flush = () => {
    if (!cur) return;
    blocks.push({
      heading: cur.heading,
      fields: cur.fields,
      fieldOrder: cur.fieldOrder,
      prose: cur.proseLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
    });
    cur = null;
  };

  for (const line of lines) {
    const h = HEADING_RE.exec(line);
    if (h) {
      flush();
      cur = { heading: h[1].trim(), fieldOrder: [], fields: {}, proseLines: [], inFields: true };
      continue;
    }
    if (!cur) {
      preambleLines.push(line);
      continue;
    }
    if (cur.inFields) {
      const f = FIELD_RE.exec(line);
      if (f) {
        cur.fieldOrder.push(f[1]);
        cur.fields[f[1]] = f[2];
        continue;
      }
      cur.inFields = false;
      cur.proseLines.push(line);
    } else {
      cur.proseLines.push(line);
    }
  }
  flush();
  return { preamble: preambleLines.join("\n").replace(/\n+$/, ""), blocks };
}

export function serializeEventBlock(b: EventBlock): string {
  const oneLine = (s: string) => s.replace(/\r?\n/g, " ");
  const fieldLines = b.fieldOrder
    .filter((k) => b.fields[k] !== undefined)
    .map((k) => `- ${k}:: ${oneLine(b.fields[k])}`);
  let out = `## ${oneLine(b.heading)}`;
  if (fieldLines.length) out += `\n${fieldLines.join("\n")}`;
  if (b.prose && b.prose.trim().length) out += `\n\n${b.prose}`;
  return out;
}

export function serializeMonthlyDoc(preamble: string, blocks: EventBlock[]): string {
  const parts: string[] = [];
  if (preamble && preamble.trim().length) parts.push(preamble);
  for (const b of blocks) parts.push(serializeEventBlock(b));
  return parts.join("\n\n") + "\n";
}

export function eventHeading(ev: AgendaEvent): string {
  const hhmm = (iso?: string): string => {
    if (!iso) return "";
    const m = /T(\d{2}:\d{2})/.exec(iso);
    return m ? m[1] : "";
  };
  if (ev.allDay) return ev.title;
  const s = hhmm(ev.start);
  const e = hhmm(ev.end);
  const time = s ? (e ? `${s}–${e}` : s) : "";
  return time ? `${time} ${ev.title}` : ev.title;
}

export interface UpsertResult {
  text: string;
  added: number;
  updated: number;
}

export function upsertEvents(text: string, events: AgendaEvent[]): UpsertResult {
  const { preamble, blocks } = parseMonthlyDoc(text);
  const byUid = new Map<string, EventBlock>();
  for (const b of blocks) {
    const u = b.fields["uid"];
    if (u) byUid.set(u, b);
  }
  let added = 0;
  let updated = 0;
  for (const ev of events) {
    const mf = eventToFields(ev);
    const existing = byUid.get(ev.uid);
    if (existing) {
      for (const [k, v] of Object.entries(mf)) {
        if (!existing.fieldOrder.includes(k)) existing.fieldOrder.push(k);
        existing.fields[k] = v;
      }
      existing.heading = eventHeading(ev);
      updated++;
    } else {
      const nb: EventBlock = {
        heading: eventHeading(ev),
        fields: { ...mf },
        fieldOrder: Object.keys(mf),
        prose: "",
      };
      blocks.push(nb);
      byUid.set(ev.uid, nb);
      added++;
    }
  }
  blocks.sort((a, b) => {
    const sa = a.fields["start"] || "";
    const sb = b.fields["start"] || "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return { text: serializeMonthlyDoc(preamble, blocks), added, updated };
}
