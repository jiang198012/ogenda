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
  const fieldLines = b.fieldOrder
    .filter((k) => b.fields[k] !== undefined)
    .map((k) => `- ${k}:: ${b.fields[k]}`);
  let out = `## ${b.heading}`;
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
