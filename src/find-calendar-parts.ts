export interface BodyNode {
  part?: string;
  type?: string;
  disposition?: string;
  dispositionParameters?: { filename?: string };
  parameters?: Record<string, string>;
  childNodes?: BodyNode[];
}

export function findCalendarParts(node: BodyNode | undefined): string[] {
  const out: string[] = [];
  const walk = (n?: BodyNode) => {
    if (!n) return;
    const type = String(n.type || "").toLowerCase();
    const filename = String(n.dispositionParameters?.filename || "").toLowerCase();
    const isCalendar =
      type.includes("calendar") || type === "application/ics" || filename.endsWith(".ics");
    if (isCalendar && n.part) out.push(n.part);
    n.childNodes?.forEach(walk);
  };
  walk(node);
  return out;
}
