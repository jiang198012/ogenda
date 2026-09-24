import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";

export interface FixtureEvent {
  path: string;
  uid: string;
  title: string;
  ics: string;
  etag: string;
}

export interface FixtureRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface CalDavFixture {
  baseUrl: string;
  calendarUrl: string;
  icsUrl: string;
  events: Map<string, FixtureEvent>;
  requests: FixtureRequest[];
  start(): Promise<void>;
  reset(): void;
  close(): Promise<void>;
}

export function fixtureIcs(uid: string, title: string, start = "20260924T090000", end = "20260924T100000"): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}

function defaultEvents(): FixtureEvent[] {
  return [{
    path: "/home/fixture.ics",
    uid: "fixture-1@ogenda",
    title: "Fixture 事件",
    ics: fixtureIcs("fixture-1@ogenda", "Fixture 事件"),
    etag: '"e1"',
  }];
}

function write(res: ServerResponse, status: number, body = "", headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/xml; charset=utf-8", ...headers });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function createCalDavFixture(): CalDavFixture {
  let port = 0;
  let etagCounter = 1;
  const server: Server = createServer();
  const events = new Map<string, FixtureEvent>();
  const requests: FixtureRequest[] = [];
  const seed = defaultEvents();

  const reset = (): void => {
    events.clear();
    for (const event of seed) events.set(event.path, { ...event });
    requests.length = 0;
    etagCounter = 1;
  };

  server.on("request", async (req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const body = await readBody(req);
    requests.push({ method: req.method ?? "GET", path, headers: req.headers, body });

    if (req.method === "PROPFIND" && path === "/home/") {
      write(res, 207, `<?xml version="1.0"?><multistatus xmlns="DAV:">
        <response><href>/home/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>
        <response><href>/home/</href><propstat><prop><displayname>个人</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set></prop></propstat></response>
        <response><href>/tasks/</href><propstat><prop><displayname>提醒</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VTODO"/></supported-calendar-component-set></prop></propstat></response>
        <response><href>/inbox/</href><propstat><prop><displayname>Inbox</displayname><resourcetype><collection/><schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop></propstat></response>
        <response><href>/subscribed/</href><propstat><prop><displayname>节假日</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/><subscribed xmlns="http://calendarserver.org/ns/"/></resourcetype></prop></propstat></response>
      </multistatus>`);
      return;
    }

    if (req.method === "REPORT" && path === "/home/") {
      const rows = [...events.values()].map((event) => `<response><href>${event.path}</href><propstat><prop><getetag>${event.etag}</getetag><calendar-data xmlns="urn:ietf:params:xml:ns:caldav"><![CDATA[${event.ics}]]></calendar-data></prop></propstat></response>`).join("");
      write(res, 207, `<?xml version="1.0"?><multistatus xmlns="DAV:">${rows}</multistatus>`);
      return;
    }

    if (req.method === "GET" && path === "/feed.ics") {
      const event = [...events.values()][0];
      if (!event) return write(res, 404, "not found", { "Content-Type": "text/plain" });
      write(res, 200, event.ics, { "Content-Type": "text/calendar; charset=utf-8" });
      return;
    }

    if (req.method === "PUT" && path.startsWith("/home/")) {
      const existing = events.get(path);
      const ifMatch = String(req.headers["if-match"] ?? "");
      if (existing && ifMatch !== existing.etag) return write(res, 412, "etag conflict", { "Content-Type": "text/plain" });
      const uid = /^UID:(.+)$/mi.exec(body)?.[1]?.trim() ?? decodeURIComponent(path.slice("/home/".length)).replace(/\.ics$/, "");
      const title = /^SUMMARY:(.+)$/mi.exec(body)?.[1]?.trim() ?? uid;
      const event = { path, uid, title, ics: body, etag: `"e${++etagCounter}"` };
      events.set(path, event);
      write(res, existing ? 204 : 201, "", { ETag: event.etag });
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/home/")) {
      const existing = events.get(path);
      if (!existing) return write(res, 404, "not found", { "Content-Type": "text/plain" });
      if (String(req.headers["if-match"] ?? "") !== existing.etag) return write(res, 412, "etag conflict", { "Content-Type": "text/plain" });
      events.delete(path);
      write(res, 204);
      return;
    }

    write(res, 404, "not found", { "Content-Type": "text/plain" });
  });

  reset();
  return {
    get baseUrl() { return `http://127.0.0.1:${port}`; },
    get calendarUrl() { return `http://127.0.0.1:${port}/home/`; },
    get icsUrl() { return `http://127.0.0.1:${port}/feed.ics`; },
    events,
    requests,
    start: () => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => {
      port = (server.address() as { port: number }).port;
      resolve();
    })),
    reset,
    close: () => new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
