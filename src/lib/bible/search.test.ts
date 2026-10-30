import { drizzle } from "drizzle-orm/pg-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetQueryCache } from "@/lib/embeddings/query";

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

describe("searchVerses without vectors", () => {
  beforeEach(resetQueryCache);

  type Sent = { sql: string; params: unknown[] };

  // A database that records what it is asked and answers from `rows`.
  function database(rows: (sql: string) => unknown[][] = () => []) {
    const sent: Sent[] = [];
    const db = drizzle(async (sql, params) => {
      sent.push({ sql, params });
      if (sql.includes("numnode")) return { rows: [{ nodes: 2 }] };
      return { rows: sql.includes("count(*)") ? [{ count: 3 }] : rows(sql) };
    }) as unknown as Parameters<typeof searchVerses>[0];
    return { db, sent };
  }

  const usesVectors = (sent: Sent[]) => sent.some((query) => query.sql.includes("passage_embedding"));
  const provider = (embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]))) => ({
    name: "stub" as const,
    embeddingModel: "test-model",
    minSimilarity: 0,
    embed,
  });

  const request = { query: "living water", translationIds: ["bsb"] };

  it("is the keyword search when no mode is asked for, provider or not", async () => {
    const { db, sent } = database();
    const stub = provider();
    const results = await searchVerses(db, { ...request, provider: stub });
    expect(results).toEqual({ hits: [], total: 3, searchable: true });
    expect(usesVectors(sent)).toBe(false);
    expect(stub.embed).not.toHaveBeenCalled();
  });

  it("is the keyword search in every mode without a provider", async () => {
    for (const mode of ["meaning", "both"] as const) {
      const { db, sent } = database();
      expect(await searchVerses(db, { ...request, mode })).toEqual({ hits: [], total: 3, searchable: true });
      expect(usesVectors(sent)).toBe(false);
    }
  });

  it("is the keyword search when the provider makes no embeddings", async () => {
    const { db, sent } = database();
    const stub = { ...provider(), embeddingModel: null };
    const results = await searchVerses(db, { ...request, mode: "both", provider: stub });
    expect(results.mode).toBeUndefined();
    expect(usesVectors(sent)).toBe(false);
  });

  it("is the keyword search, with no call made, when the translation has no vectors", async () => {
    const { db } = database();
    const stub = provider();
    const results = await searchVerses(db, { ...request, mode: "meaning", provider: stub });
    expect(results).toEqual({ hits: [], total: 3, searchable: true });
    expect(stub.embed).not.toHaveBeenCalled();
  });

  it("is the keyword search, and no error, when the query cannot be embedded", async () => {
    const { db } = database((sql) => (sql.includes("passage_embedding") ? [[1]] : []));
    const failing = provider(vi.fn(async () => Promise.reject(new Error("Voyage is down"))));
    const results = await searchVerses(db, { ...request, mode: "both", provider: failing });
    expect(results).toEqual({ hits: [], total: 3, searchable: true });
    expect(failing.embed).toHaveBeenCalled();
  });

  it("ranks by vector when asked and able, in the translations that have them", async () => {
    const { db, sent } = database((sql) => (sql.includes("select 1") ? [[1]] : []));
    Object.assign(db, { transaction: (run: (tx: typeof db) => unknown) => run(db) });
    const results = await searchVerses(db, { ...request, mode: "meaning", provider: provider() });
    expect(results).toEqual({ hits: [], total: 0, searchable: true, mode: "meaning" });
    const nearest = sent.find((query) => query.sql.includes("<=>"));
    expect(nearest?.sql).toContain(`order by "passage_embedding"."embedding" <=>`);
    expect(nearest?.params).toContain("test-model");
    expect(nearest?.params).toContain("bsb");
    expect(sent.some((query) => query.sql.includes("hnsw.iterative_scan"))).toBe(true);
  });

  it("carries the book or testament filter into the vector search", async () => {
    const { db, sent } = database((sql) => (sql.includes("select 1") ? [[1]] : []));
    Object.assign(db, { transaction: (run: (tx: typeof db) => unknown) => run(db) });
    await searchVerses(db, {
      ...request,
      mode: "meaning",
      provider: provider(),
      ranges: [{ start: 45001001, end: 45016027 }],
    });
    const nearest = sent.find((query) => query.sql.includes("<=>"));
    expect(nearest?.sql).toContain(`"passage_embedding"."verse_start" >=`);
    expect(nearest?.params).toEqual(expect.arrayContaining([45001001, 45016027]));
  });
});
