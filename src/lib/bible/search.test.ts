import { describe, expect, it } from "vitest";

import { MAX_QUERY_LENGTH, normalizeQuery, searchVerses, splitHeadline } from "./search";

const S = "";
const E = "";

describe("splitHeadline", () => {
  it("cuts the text where the matches are", () => {
    expect(splitHeadline(`Streams of ${S}living${E} ${S}water${E} will flow`)).toEqual([
      { text: "Streams of ", match: false },
      { text: "living", match: true },
      { text: " ", match: false },
      { text: "water", match: true },
      { text: " will flow", match: false },
    ]);
  });

  it("handles a match at either end", () => {
    expect(splitHeadline(`${S}Love${E} must be ${S}sincere${E}`)).toEqual([
      { text: "Love", match: true },
      { text: " must be ", match: false },
      { text: "sincere", match: true },
    ]);
  });

  it("is one unmatched stretch when nothing matched", () => {
    expect(splitHeadline("In the beginning")).toEqual([{ text: "In the beginning", match: false }]);
    expect(splitHeadline("")).toEqual([]);
  });

  it("keeps all the text and none of the markers", () => {
    const marked = `${S}a${E}b${S}c${E}${S}d${E} e${E}`;
    const segments = splitHeadline(marked);
    expect(segments.map((segment) => segment.text).join("")).toBe("abcd e");
    expect(segments.filter((segment) => segment.match).map((segment) => segment.text)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});

describe("normalizeQuery", () => {
  it("reads curly quotation marks as the plain ones that mark a phrase", () => {
    expect(normalizeQuery("“good shepherd” sheep")).toBe('"good shepherd" sheep');
    expect(normalizeQuery("«bread of life»")).toBe('"bread of life"');
  });

  it("trims, and cuts off a query nobody would type", () => {
    expect(normalizeQuery("  living water ")).toBe("living water");
    expect(normalizeQuery("x".repeat(5000))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("searchVerses", () => {
  // Reaching the database would throw: there is none here.
  const db = new Proxy({}, { get: () => () => Promise.reject(new Error("no database")) });

  it("does not query for an empty search or with no translations", async () => {
    const empty = { hits: [], total: 0 };
    expect(await searchVerses(db as never, { query: "  ", translationIds: ["bsb"] })).toEqual({
      ...empty,
      searchable: false,
    });
    expect(await searchVerses(db as never, { query: "water", translationIds: [] })).toEqual({
      ...empty,
      searchable: true,
    });
  });
});
