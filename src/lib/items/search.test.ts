import { drizzle } from "drizzle-orm/pg-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/db/client";
import { resetQueryCache } from "@/lib/embeddings/query";

import { itemsHaveVectors, searchItems } from "./search";

// searchItems against a stand-in database that records the SQL it is sent and
// answers from `answer`. The behaviour on real rows is journey 10
// (e2e/my-items.spec.ts).

type Sent = { sql: string; params: unknown[] };

function recordingDb(answer: (sql: string) => unknown[] = () => []) {
  const sent: Sent[] = [];
  const db = drizzle(async (sql, params) => {
    sent.push({ sql, params });
    if (sql.includes("count(*)::int")) return { rows: [[0]] };
    return { rows: sql.includes("count(*)") ? [{ count: 0 }] : answer(sql) };
  });
  return { db: db as unknown as Db, sent };
}

const OWNER = "owner-id";
const page = { limit: 20 };

const provider = (embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]))) => ({
  name: "stub" as const,
  embeddingModel: "test-model",
  minSimilarity: 0.5,
  embed,
});

// The query that chooses the items to show: the one with an order.
const listQuery = (sent: Sent[]) =>
  sent.find((query) => /^select "id" from "item" .*order by/.test(query.sql))!;

describe("searchItems", () => {
  beforeEach(resetQueryCache);

  it("is the newest first with no words, narrowed to the owner", async () => {
    const { db, sent } = recordingDb();
    const results = await searchItems(db, OWNER, {}, page);
    expect(results).toEqual({ items: [], total: 0, order: "newest" });
    const { sql, params } = listQuery(sent);
    expect(sql).toContain(`"item"."owner_id" = $1`);
    expect(params[0]).toBe(OWNER);
    expect(sql).toContain(`order by "item"."created_at" desc`);
  });

  it("searches title, Markdown and note, and the text as typed inside a word", async () => {
    const { db, sent } = recordingDb();
    const results = await searchItems(db, OWNER, { text: "true vine" }, page);
    expect(results.order).toBe("words");
    const { sql, params } = listQuery(sent);
    expect(sql).toContain(`"item"."search" @@ websearch_to_tsquery('english', $`);
    expect(sql).toContain(`"item"."title" ilike`);
    expect(sql).toContain(`"item"."markdown" ilike`);
    expect(sql).toContain(`"item"."note" ilike`);
    expect(sql).toContain(`order by ts_rank_cd("item"."search"`);
    expect(params).toContain("true vine");
    expect(params).toContain("%true vine%");
  });

  it("treats % and _ in what is typed as themselves", async () => {
    const { db, sent } = recordingDb();
    await searchItems(db, OWNER, { text: "100%_sure" }, page);
    expect(listQuery(sent).params).toContain("%100\\%\\_sure%");
  });

  it("finds overlapping passages through the expression the GiST index is on", async () => {
    const { db, sent } = recordingDb();
    await searchItems(db, OWNER, { ranges: [{ start: 43015001, end: 43015005 }] }, page);
    const { sql, params } = listQuery(sent);
    expect(sql).toContain(
      `int4range("item_passage"."verse_start", "item_passage"."verse_end", '[]') && int4range($`,
    );
    expect(params).toEqual(expect.arrayContaining([43015001, 43015005]));
  });

  it("finds nothing for a list of no ranges", async () => {
    const { db, sent } = recordingDb();
    await searchItems(db, OWNER, { ranges: [] }, page);
    expect(listQuery(sent).sql).toContain("false");
  });

  it("narrows by tag, kinds, color and visibility together", async () => {
    const { db, sent } = recordingDb();
    await searchItems(
      db,
      OWNER,
      { tag: "abiding", kinds: ["note", "reflection"], color: "green", visibility: "public" },
      page,
    );
    const { sql, params } = listQuery(sent);
    expect(sql).toContain(`"item"."kind" in (`);
    expect(sql).toContain(`"item"."color" = `);
    expect(sql).toContain(`"item"."visibility" = `);
    expect(sql).toContain(`"tag"."slug" = `);
    expect(params).toEqual(expect.arrayContaining(["abiding", "note", "reflection", "green", "public"]));
  });

  it("leaves out the item being edited", async () => {
    const { db, sent } = recordingDb();
    await searchItems(db, OWNER, { except: "this-one" }, page);
    expect(listQuery(sent).params).toContain("this-one");
  });

  it("does not use vectors unless asked, or without a provider or words", async () => {
    const stub = provider();
    for (const [search, options] of [
      [{ text: "vine" }, { ...page, provider: stub }],
      [{ text: "vine", meaning: true }, page],
      [{ meaning: true }, { ...page, provider: stub }],
    ] as const) {
      const { db, sent } = recordingDb();
      await searchItems(db, OWNER, search, options);
      expect(sent.some((query) => query.sql.includes("item_embedding"))).toBe(false);
    }
    expect(stub.embed).not.toHaveBeenCalled();
  });

  it("goes by words alone when the query cannot be embedded", async () => {
    const { db, sent } = recordingDb();
    const failing = provider(vi.fn(async () => Promise.reject(new Error("down"))));
    const results = await searchItems(db, OWNER, { text: "vine", meaning: true }, { ...page, provider: failing });
    expect(results.order).toBe("words");
    expect(sent.some((query) => query.sql.includes("item_embedding"))).toBe(false);
  });

  it("fuses words and meaning, inside the same filters and the owner's items only", async () => {
    const { db, sent } = recordingDb((sql) => {
      if (sql.includes("item_embedding")) {
        return [
          ["both-lists", 0.1],
          ["meaning-only", 0.2],
          ["too-far", 0.9],
        ];
      }
      return sql.includes("ts_rank_cd") ? [["words-only"], ["both-lists"]] : [];
    });
    const results = await searchItems(
      db,
      OWNER,
      { text: "vine", meaning: true, kinds: ["note"] },
      { ...page, provider: provider() },
    );
    expect(results.order).toBe("words-and-meaning");
    // "too-far" is under the provider's floor.
    expect(results.total).toBe(3);

    const vectors = sent.find((query) => query.sql.includes(`<=>`))!;
    expect(vectors.sql).toContain(`"item"."owner_id" = $`);
    expect(vectors.sql).toContain(`"item"."kind" in (`);
    expect(vectors.sql).toContain(`"item_embedding"."model" = $`);
    expect(vectors.params).toEqual(expect.arrayContaining([OWNER, "test-model", "note"]));
  });
});

describe("itemsHaveVectors", () => {
  it("asks about the owner's own items, in this model", async () => {
    const { db, sent } = recordingDb(() => [[1]]);
    expect(await itemsHaveVectors(db, OWNER, "test-model")).toBe(true);
    expect(sent[0].sql).toContain(`"item"."owner_id" = $`);
    expect(sent[0].params).toEqual(expect.arrayContaining([OWNER, "test-model"]));
  });

  it("is false with no model, with nothing asked", async () => {
    const { db, sent } = recordingDb();
    expect(await itemsHaveVectors(db, OWNER, null)).toBe(false);
    expect(sent).toEqual([]);
  });
});
