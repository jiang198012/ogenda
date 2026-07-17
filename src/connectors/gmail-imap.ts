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

// TEMP diagnostic: flatten a bodyStructure to its leaf parts' identifying fields.
function summarizeParts(node: any): any[] {
  const acc: any[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (!n.childNodes || n.childNodes.length === 0) {
      acc.push({
        part: n.part,
        type: n.type,
        disposition: n.disposition,
        filename: n.dispositionParameters?.filename ?? n.parameters?.name,
      });
    }
    n.childNodes?.forEach(walk);
  };
  walk(node);
  return acc;
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
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mb = client.mailbox;
        const total = mb ? mb.exists : 0;
        const start = Math.max(1, total - this.scanCount + 1);
        console.log(`[ogenda] INBOX total=${total}, scanning seq ${start}:*`);
        let scanned = 0;
        let withParts = 0;
        if (total > 0) {
          for await (const msg of client.fetch(`${start}:*`, {
            uid: true,
            bodyStructure: true,
            envelope: true,
          })) {
            scanned++;
            const parts = findCalendarParts(msg.bodyStructure as any);
            // TEMP diagnostic per message
            console.log(
              `[ogenda] seq=${msg.seq} subj=${JSON.stringify(msg.envelope?.subject ?? "")} matched=${JSON.stringify(parts)} allParts=`,
              JSON.stringify(summarizeParts(msg.bodyStructure as any)),
            );
            if (parts.length > 0) withParts++;
            for (const part of parts) {
              try {
                const dl = await client.download(msg.uid, part, { uid: true });
                const ics = await streamToString(dl.content);
                const evs = icalToEvents(ics, this.id);
                console.log(`[ogenda]   part=${part} -> ${evs.length} event(s)`);
                out.push(...evs);
              } catch (e) {
                console.error("[ogenda] failed to read calendar part", part, e);
              }
            }
          }
        }
        console.log(
          `[ogenda] scanned=${scanned} messagesWithCalendarParts=${withParts} eventsMapped=${out.length}`,
        );
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore logout errors during cleanup (connection may already be broken)
      }
    }
    return dedupeByUid(out);
  }
}
