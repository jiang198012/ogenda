import { requestUrl } from "obsidian";

export interface DavResponse {
  status: number;
  text: string;
  etag?: string;
}

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
  const res = await requestUrl({
    url: opts.url,
    method: opts.method,
    headers,
    body: opts.body,
    throw: false,
  });
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
