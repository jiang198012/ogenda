import { AgendaEvent } from "../../core/event";
import { icalToEvents } from "../../core/ical-map";
import { davRequest } from "../../net/dav-request";
import { Connector, dedupeByUid } from "../connector";
import { parseCalendarQuery } from "./parse-report";

export interface CalDavConfig {
  user: string;
  pass: string;
  calendarUrl: string; // full URL to the calendar collection
  label: string; // e.g. "icloud"
}

const QUERY_BODY = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>`;

export class CalDavConnector implements Connector {
  id: string;
  constructor(private cfg: CalDavConfig) {
    this.id = "caldav/" + cfg.label;
  }

  async fetch(): Promise<AgendaEvent[]> {
    const res = await davRequest({
      url: this.cfg.calendarUrl,
      method: "REPORT",
      user: this.cfg.user,
      pass: this.cfg.pass,
      depth: "1",
      contentType: "application/xml; charset=utf-8",
      body: QUERY_BODY,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CalDAV query failed: HTTP ${res.status}`);
    }
    const out: AgendaEvent[] = [];
    for (const r of parseCalendarQuery(res.text)) {
      // resource href is a path relative to the calendar host; resolve to a full URL for D2 write-back
      const fullHref = new URL(r.href, this.cfg.calendarUrl).toString();
      for (const ev of icalToEvents(r.ics, this.id, "caldav")) {
        ev.href = fullHref;
        ev.etag = r.etag;
        out.push(ev);
      }
    }
    return dedupeByUid(out);
  }
}
