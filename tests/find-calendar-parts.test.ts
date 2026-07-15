import { describe, it, expect } from "vitest";
import { findCalendarParts } from "../src/find-calendar-parts";

const sample = {
  type: "multipart/mixed",
  childNodes: [
    { part: "1", type: "text/plain" },
    { part: "2", type: "text/calendar", parameters: { method: "REQUEST" } },
    {
      part: "3",
      type: "application/octet-stream",
      disposition: "attachment",
      dispositionParameters: { filename: "invite.ics" },
    },
  ],
};

describe("findCalendarParts", () => {
  it("finds text/calendar and .ics attachment parts", () => {
    expect(findCalendarParts(sample)).toEqual(["2", "3"]);
  });
  it("returns empty when no calendar parts", () => {
    expect(findCalendarParts({ type: "text/plain", part: "1" })).toEqual([]);
  });
});
