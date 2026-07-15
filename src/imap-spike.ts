import { ImapFlow } from "imapflow";
import { Notice } from "obsidian";
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
