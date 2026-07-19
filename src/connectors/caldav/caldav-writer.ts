import { davRequest } from "../../net/dav-request";

export interface CalDavWriterConfig {
  user: string;
  pass: string;
}

export interface PutResult {
  status: number;
  etag?: string;
  text?: string;
}

export class CalDavWriter {
  constructor(private cfg: CalDavWriterConfig) {}

  async putEvent(url: string, ics: string, ifMatch?: string): Promise<PutResult> {
    const res = await davRequest({
      url,
      method: "PUT",
      user: this.cfg.user,
      pass: this.cfg.pass,
      contentType: "text/calendar; charset=utf-8",
      body: ics,
      ifMatch,
    });
    return { status: res.status, etag: res.etag, text: res.text };
  }

  async deleteEvent(url: string, ifMatch: string): Promise<{ status: number }> {
    const res = await davRequest({ url, method: "DELETE", user: this.cfg.user, pass: this.cfg.pass, ifMatch });
    return { status: res.status };
  }
}
