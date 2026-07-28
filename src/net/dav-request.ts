import { requestUrl } from "obsidian";
import { withTimeout } from "./with-timeout";

export interface DavResponse {
  status: number;
  text: string;
  etag?: string;
}

/** Per-request ceiling. Without it a stalled server hangs the whole sync forever. */
export const DAV_TIMEOUT_MS = 30_000;

/** Low-level CalDAV/WebDAV request via Obsidian requestUrl (bypasses CORS, allows custom methods). */
export async function davRequest(opts: {
  url: string;
  method: string;
  user: string;
  pass: string;
  body?: string;
  depth?: string;
  contentType?: string;
  ifMatch?: string;
}): Promise<DavResponse> {
  const headers: Record<string, string> = {
    Authorization: "Basic " + btoa(`${opts.user}:${opts.pass}`),
  };
  if (opts.depth) headers["Depth"] = opts.depth;
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
  const res = await withTimeout(
    requestUrl({
      url: opts.url,
      method: opts.method,
      headers,
      body: opts.body,
      throw: false,
    }),
    DAV_TIMEOUT_MS,
    `${opts.method} ${opts.url} timed out after ${DAV_TIMEOUT_MS / 1000}s`,
  );
  const h = (res.headers || {}) as Record<string, string>;
  return { status: res.status, text: res.text, etag: h["etag"] ?? h["Etag"] ?? h["ETag"] };
}

/** Tolerant XML extraction: text of the first descendant whose localName matches. */
export function firstTag(xml: string, localName: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const els = doc.getElementsByTagName("*");
  for (let i = 0; i < els.length; i++) {
    if (els[i].localName === localName) return (els[i].textContent || "").trim();
  }
  return null;
}

/** The first <href> nested inside the first element with the given localName. */
export function hrefInside(xml: string, parentLocalName: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const els = doc.getElementsByTagName("*");
  for (let i = 0; i < els.length; i++) {
    if (els[i].localName === parentLocalName) {
      const inner = els[i].getElementsByTagName("*");
      for (let j = 0; j < inner.length; j++) {
        if (inner[j].localName === "href") return (inner[j].textContent || "").trim();
      }
    }
  }
  return null;
}
