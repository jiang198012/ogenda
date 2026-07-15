import { ImapFlow } from "imapflow";
import ICAL from "ical.js";
import { Notice } from "obsidian";
import { findCalendarParts } from "./find-calendar-parts";
import type { SpikeSettings } from "./spike-settings";

export function makeClient(s: SpikeSettings): ImapFlow {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: s.email, pass: s.appPassword },
    logger: false,
  });
}

export async function imapConnectTest(s: SpikeSettings): Promise<void> {
  const client = makeClient(s);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const n = mb ? mb.exists : 0;
      console.log("[ogenda] INBOX exists:", n);
      new Notice(`IMAP OK: INBOX has ${n} messages`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error("[ogenda] IMAP connect failed:", e);
    new Notice("IMAP connect FAILED: " + (e as Error).message);
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf-8");
}

export async function dumpOneInvite(s: SpikeSettings): Promise<void> {
  const client = makeClient(s);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const total = mb ? mb.exists : 0;
      const start = Math.max(1, total - 49); // 最近 ~50 封
      for await (const msg of client.fetch(`${start}:*`, {
        uid: true,
        bodyStructure: true,
        envelope: true,
      })) {
        const parts = findCalendarParts(msg.bodyStructure as any);
        if (parts.length === 0) continue;
        console.log("[ogenda] invite subject:", msg.envelope?.subject, "parts:", parts);
        const dl = await client.download(msg.uid, parts[0], { uid: true });
        const ics = await streamToString(dl.content);
        console.log("[ogenda] RAW ICS:\n" + ics);
        try {
          const comp = new ICAL.Component(ICAL.parse(ics));
          const vevent = comp.getFirstSubcomponent("vevent");
          if (vevent) {
            const ev = new ICAL.Event(vevent);
            console.log("[ogenda] parsed:", ev.summary, String(ev.startDate), String(ev.endDate));
            new Notice(`Invite parsed: ${ev.summary}`);
          }
        } catch (pe) {
          console.error("[ogenda] ical parse failed:", pe);
        }
        await client.logout();
        return;
      }
      new Notice("No calendar invite found in last 50 messages");
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error("[ogenda] dump failed:", e);
    new Notice("dump failed: " + (e as Error).message);
  }
}
