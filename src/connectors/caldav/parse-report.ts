export interface CalResource {
  href: string;
  etag: string;
  ics: string;
}

/**
 * Parse a CalDAV `calendar-query` multistatus into member event resources.
 * Skips the collection's own response (whose calendar-data is empty/404) and any
 * response without VCALENDAR data (schedule inbox/outbox, etc.).
 */
export function parseCalendarQuery(xml: string): CalResource[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: CalResource[] = [];
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName !== "response") continue;
    const inner = all[i].getElementsByTagName("*");
    let href = "";
    let etag = "";
    let ics = "";
    for (let j = 0; j < inner.length; j++) {
      const el = inner[j];
      if (el.localName === "href" && !href) href = (el.textContent || "").trim();
      else if (el.localName === "getetag" && !etag) etag = (el.textContent || "").trim();
      else if (el.localName === "calendar-data") {
        const t = (el.textContent || "").trim();
        if (t.includes("BEGIN:VCALENDAR")) ics = t;
      }
    }
    if (ics) out.push({ href, etag, ics });
  }
  return out;
}
