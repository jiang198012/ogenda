export interface DiscoveredCalendar {
  name: string;
  url: string;
}

/**
 * Parse a calendar-home PROPFIND (Depth: 1) multistatus into selectable calendars.
 * Keeps only writable calendar collections: the home collection itself, schedule
 * inbox/outbox and read-only subscriptions are skipped.
 */
export function parseCalendarList(xml: string, homeUrl: string): DiscoveredCalendar[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: DiscoveredCalendar[] = [];
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName !== "response") continue;
    const inner = all[i].getElementsByTagName("*");
    let href = "";
    let displayName = "";
    const types = new Set<string>();
    for (let j = 0; j < inner.length; j++) {
      const el = inner[j];
      if (el.localName === "href" && !href) href = (el.textContent || "").trim();
      else if (el.localName === "displayname" && !displayName) displayName = (el.textContent || "").trim();
      else if (el.localName === "resourcetype") {
        const kinds = el.getElementsByTagName("*");
        for (let k = 0; k < kinds.length; k++) types.add(kinds[k].localName || "");
      }
    }
    if (!href) continue;
    if (!types.has("calendar")) continue;
    if (types.has("subscribed") || types.has("schedule-inbox") || types.has("schedule-outbox")) continue;
    const url = new URL(href, homeUrl).toString();
    out.push({ name: displayName || lastSegment(url), url });
  }
  return out;
}

function lastSegment(url: string): string {
  const parts = url.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? url);
}
