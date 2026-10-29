import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { Db } from "@/db/client";

import { findByKey, findReachable, listPublicItems, listed, publicTag, publicTags, reachable } from "./public";

// The public queries, run against a stand-in database that records the SQL
// each one sends and finds nothing. What is checked is what each asks the
// database for: the condition on `visibility` that keeps private and
// unlisted items off the public site. Journey 9 (e2e/public-site.spec.ts)
// checks the same against real items.

type Sent = { sql: string; params: unknown[] };

function recordingDb(): { db: Db; sent: Sent[] } {
  const sent: Sent[] = [];
  const db = drizzle(async (sql, params) => {
    sent.push({ sql, params });
    return { rows: sql.includes("count(*)") ? [[0]] : [] };
  });
  return { db: db as unknown as Db, sent };
}

const toQuery = (condition: ReturnType<typeof listed>) => new PgDialect().sqlToQuery(condition);

// The queries that read `item` rows to show, as opposed to the passages and
// tags of items already chosen.
const itemQueries = (sent: Sent[]) => sent.filter((query) => /from "item"/.test(query.sql));

describe("listed", () => {
  it("is public items only", () => {
    const { sql, params } = toQuery(listed());
    expect(sql).toBe(`"item"."visibility" = $1`);
    expect(params).toEqual(["public"]);
  });

  it("stays public items only when narrowed to a tag or a passage", () => {
    const { sql, params } = toQuery(listed({ tag: "grace", ranges: [{ start: 45008001, end: 45008039 }] }));
    expect(sql).toMatch(/^\("item"\."visibility" = \$1 and exists /);
    expect(params[0]).toBe("public");
    expect(params).toContain("grace");
    expect(sql).toContain(`int4range("item_passage"."verse_start", "item_passage"."verse_end", '[]') &&`);
    expect(params).not.toContain("unlisted");
    expect(params).not.toContain("private");
  });
});

describe("reachable", () => {
  it("is public and unlisted items for a visitor", () => {
    const { sql, params } = toQuery(reachable());
    expect(sql).toBe(`"item"."visibility" in ($1, $2)`);
    expect(params).toEqual(["public", "unlisted"]);
  });

  it("adds the owner's own items, private ones too, for the owner", () => {
    const { sql, params } = toQuery(reachable("owner-id"));
    expect(sql).toBe(`("item"."visibility" in ($1, $2) or "item"."owner_id" = $3)`);
    expect(params).toEqual(["public", "unlisted", "owner-id"]);
  });
});

describe("listPublicItems", () => {
  it.each([
    ["the front page", {}],
    ["a tag", { tag: "grace" }],
    ["a passage", { ranges: [{ start: 45008001, end: 45008039 }] }],
  ])("asks only for public items on %s, newest published first", async (_name, filter) => {
    const { db, sent } = recordingDb();
    expect(await listPublicItems(db, filter, { limit: 10, offset: 20 })).toEqual({
      items: [],
      total: 0,
    });
    const queries = itemQueries(sent);
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.sql).toMatch(/ where \(?"item"\."visibility" = \$1/);
      expect(query.params[0]).toBe("public");
      expect(query.params).not.toContain("unlisted");
      expect(query.params).not.toContain("private");
    }
    expect(queries[1].sql).toContain(`order by "item"."published_at" desc, "item"."id" desc`);
    expect(queries[1].params.slice(-2)).toEqual([10, 20]);
  });

  it("asks for nothing when the passage is no verses", async () => {
    const { db, sent } = recordingDb();
    expect(await listPublicItems(db, { ranges: [] }, { limit: 10 })).toEqual({ items: [], total: 0 });
    expect(sent).toEqual([]);
  });
});

describe("findByKey", () => {
  it("looks for public and unlisted items whose ids start with the key", async () => {
    const { db, sent } = recordingDb();
    expect(await findByKey(db, "3f9a2c1b7d4e")).toEqual([]);
    const [query] = itemQueries(sent);
    expect(query.sql).toContain(`"item"."id" between $1 and $2`);
    expect(query.sql).toContain(`"item"."visibility" in ($3, $4)`);
    expect(query.params.slice(0, 4)).toEqual([
      "3f9a2c1b-7d4e-0000-0000-000000000000",
      "3f9a2c1b-7d4e-ffff-ffff-ffffffffffff",
      "public",
      "unlisted",
    ]);
    expect(query.params).not.toContain("private");
  });

  it("finds the owner's private items for the owner only", async () => {
    const { db, sent } = recordingDb();
    await findByKey(db, "3f9a2c1b7d4e", { ownerId: "owner-id" });
    const [query] = itemQueries(sent);
    expect(query.sql).toContain(`or "item"."owner_id" = $5`);
    expect(query.params).toContain("owner-id");
  });
});

describe("findReachable", () => {
  const ID = "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b";

  it("looks for the item only while it is public or unlisted", async () => {
    const { db, sent } = recordingDb();
    expect(await findReachable(db, ID)).toBeUndefined();
    const [query] = itemQueries(sent);
    expect(query.sql).toContain(`where ("item"."id" = $1 and "item"."visibility" in ($2, $3))`);
    expect(query.params.slice(0, 3)).toEqual([ID, "public", "unlisted"]);
    expect(query.params).not.toContain("private");
  });

  it("finds the owner's private item for the owner only", async () => {
    const { db, sent } = recordingDb();
    await findReachable(db, ID, { ownerId: "owner-id" });
    const [query] = itemQueries(sent);
    expect(query.sql).toContain(`or "item"."owner_id" = $4`);
    expect(query.params).toContain("owner-id");
  });
});

describe("tags", () => {
  it("names a tag only while a public item has it", async () => {
    const { db, sent } = recordingDb();
    expect(await publicTag(db, "grace")).toBeUndefined();
    expect(sent[0].sql).toContain(`"item"."visibility" = $`);
    expect(sent[0].params).toContain("public");
    expect(sent[0].params).not.toContain("unlisted");
  });

  it("lists the tags of public items only", async () => {
    const { db, sent } = recordingDb();
    expect(await publicTags(db)).toEqual([]);
    expect(sent[0].sql).toContain(`where "item"."visibility" = $1`);
    expect(sent[0].params).toEqual(["public"]);
  });
});
