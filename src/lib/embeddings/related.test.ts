import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { Db } from "@/db/client";

import { blendRelated, relatedPassages } from "./related";

const range = (start: number, end: number) => ({ start, end });
const JOHN_14_27 = range(43014027, 43014027);

describe("blendRelated", () => {
  it("lists windows then cross references when they do not meet", () => {
    const blended = blendRelated([range(1, 4)], [range(20, 20)]);
    expect(blended.map((entry) => entry.sources)).toEqual([["meaning"], ["cross-reference"]]);
  });

  it("makes one suggestion of two that overlap, on the cross reference's verses, ranked first", () => {
    const blended = blendRelated([range(1, 4), range(10, 13)], [range(11, 12)]);
    expect(blended[0]).toMatchObject({ start: 11, end: 12, sources: ["meaning", "cross-reference"] });
    expect(blended).toHaveLength(2);
  });

  it("is cross references alone without vectors", () => {
    expect(blendRelated([], [range(5, 5), range(9, 9)]).map((entry) => entry.start)).toEqual([5, 9]);
  });
});

// The columns getCrossReferences() reads, and getPassages()'s.
const crossRef = (toStart: number) => [43014027, toStart, toStart, 12];
const verseRow = (verseId: number, text: string) => ["bsb", verseId, text, [], [], [], []];

function database(answer: (sql: string, params: unknown[]) => unknown[]) {
  const sent: string[] = [];
  const db = drizzle(async (sql, params) => {
    sent.push(sql);
    return { rows: answer(sql, params) };
  }) as unknown as Db;
  Object.assign(db, { transaction: (run: (tx: Db) => unknown) => run(db) });
  return { db, sent };
}

describe("relatedPassages", () => {
  it("falls back to cross references with no provider, and drops what is not loaded", async () => {
    const { db, sent } = database((sql) => {
      if (sql.includes(`from "cross_ref"`)) return [crossRef(19046001), crossRef(1001001)];
      if (sql.includes(`from "verse"`)) return [verseRow(19046001, "God is our refuge\nand strength.")];
      return [];
    });
    const result = await relatedPassages(db, JOHN_14_27, { translationId: "bsb" });
    expect(result.meaning).toBe(false);
    expect(result.passages).toEqual([
      {
        start: 19046001,
        end: 19046001,
        reference: "Psalm 46:1",
        text: "God is our refuge and strength.",
        sources: ["cross-reference"],
      },
    ]);
    expect(sent.some((sql) => sql.includes("passage_embedding"))).toBe(false);
  });

  it("falls back the same way when no translation has vectors", async () => {
    const { db } = database((sql) => (sql.includes(`from "cross_ref"`) ? [crossRef(19046001)] : []));
    const result = await relatedPassages(db, JOHN_14_27, {
      translationId: "bsb",
      provider: { embeddingModel: "test-model", minSimilarity: 0 },
    });
    expect(result.meaning).toBe(false);
  });

  it("never suggests the passage itself", async () => {
    const { db } = database((sql) => {
      if (sql.includes(`from "cross_ref"`)) return [crossRef(43014027), crossRef(19046001)];
      if (sql.includes(`from "verse"`)) return [verseRow(19046001, "God is our refuge.")];
      return [];
    });
    const { passages } = await relatedPassages(db, JOHN_14_27, { translationId: "bsb" });
    expect(passages.map((passage) => passage.reference)).toEqual(["Psalm 46:1"]);
  });

  it("compares in another translation's vectors when this one has none", async () => {
    const asked: unknown[][] = [];
    const { db } = database((sql, params) => {
      if (sql.includes("avg(")) {
        asked.push(params);
        return [["[1,0]", 43014025, 43014028]];
      }
      if (sql.startsWith(`select "translation_id" from "passage_embedding"`)) {
        return params.includes("kjv") ? [] : [["bsb"]];
      }
      if (sql.includes("<=>")) return [["bsb", 19046001, 19046004, 0.2]];
      if (sql.includes(`from "verse"`)) {
        return [["kjv", 19046001, "God is our refuge and strength", [], [], [], []]];
      }
      return [];
    });
    const result = await relatedPassages(db, JOHN_14_27, {
      translationId: "kjv",
      provider: { embeddingModel: "test-model", minSimilarity: 0 },
    });
    expect(asked[0]).toContain("bsb");
    expect(result.meaning).toBe(true);
    expect(result.passages[0]).toMatchObject({
      reference: "Psalm 46:1-4",
      text: "God is our refuge and strength",
      sources: ["meaning"],
    });
  });

  it("stays away from the verses around the passage", async () => {
    let nearest: unknown[] = [];
    const { db } = database((sql, params) => {
      if (sql.includes("avg(")) return [["[1,0]", 43014025, 43014030]];
      if (sql.startsWith(`select "translation_id" from "passage_embedding"`)) return [["bsb"]];
      if (sql.includes("<=>")) nearest = params;
      return [];
    });
    await relatedPassages(db, JOHN_14_27, {
      translationId: "bsb",
      provider: { embeddingModel: "test-model", minSimilarity: 0 },
    });
    expect(nearest).toEqual(expect.arrayContaining([43014025, 43014030]));
  });
});
