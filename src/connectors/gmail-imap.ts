import { ImapFlow } from "imapflow";
import { AgendaEvent } from "../core/event";
import { findCalendarParts } from "../find-calendar-parts";
import { icalToEvents } from "../core/ical-map";
import { Connector, dedupeByUid } from "./connector";

export interface GmailCreds {
  email: string;
  appPassword: string;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf-8");
}

export class GmailImapConnector implements Connector {
  id = "imap/gmail";
  constructor(private creds: GmailCreds, private scanCount: number) {}

  async fetch(): Promise<AgendaEvent[]> {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: this.creds.email, pass: this.creds.appPassword },
      logger: false,
    });
    const out: AgendaEvent[] = [];
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const total = mb ? mb.exists : 0;
      if (total > 0) {
        const start = Math.max(1, total - this.scanCount + 1);
        for await (const msg of client.fetch(`${start}:*`, {
          uid: true,
          bodyStructure: true,
          envelope: true,
        })) {
          const parts = findCalendarParts(msg.bodyStructure as any);
          for (const part of parts) {
            try {
              const dl = await client.download(msg.uid, part, { uid: true });
              const ics = await streamToString(dl.content);
              out.push(...icalToEvents(ics, this.id));
            } catch (e) {
              console.error("[ogenda] failed to read calendar part", part, e);
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return dedupeByUid(out);
  }
}
