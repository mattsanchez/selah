import { readFileSync } from "node:fs";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { containsPattern, overlapsPassage, publishedAtFor, taggedWith } from "./queries";

const toQuery = (ranges: { start: number; end: number }[]) =>
  new PgDialect().sqlToQuery(overlapsPassage(ranges));

describe("overlapsPassage", () => {
  it("asks for ranges that share a verse with the passage, ends included", () => {
    const { sql, params } = toQuery([{ start: 45008001, end: 45008039 }]);
    expect(sql).toBe(
      `int4range("item_passage"."verse_start", "item_passage"."verse_end", '[]') && int4range($1::int, $2::int, '[]')`,
    );
    expect(params).toEqual([45008001, 45008039]);
  });

  it("is written as the expression the index is on, so Postgres can use it", () => {
    const migration = readFileSync(new URL("../../../drizzle/0006_items.sql", import.meta.url), "utf8");
    expect(migration).toContain(
      `USING gist (int4range("verse_start", "verse_end", '[]'))`,
    );
    expect(toQuery([{ start: 1, end: 2 }]).sql).toContain(
      `int4range("item_passage"."verse_start", "item_passage"."verse_end", '[]')`,
    );
  });

  it("matches any of several ranges, and nothing for none", () => {
    const { sql, params } = toQuery([
      { start: 43003016, end: 43003018 },
      { start: 43004001, end: 43004003 },
    ]);
    expect(sql.match(/&&/g)).toHaveLength(2);
    expect(sql).toContain(" or ");
    expect(params).toEqual([43003016, 43003018, 43004001, 43004003]);
    expect(toQuery([]).sql).toBe("false");
  });
});

describe("publishedAtFor", () => {
  const toSql = (visibility: "private" | "unlisted" | "public") =>
    new PgDialect().sqlToQuery(publishedAtFor(visibility)).sql;

  it("has no date while an item is private", () => {
    expect(toSql("private")).toBe("null");
  });

  it("keeps the date an item was first published, and sets one otherwise", () => {
    expect(toSql("public")).toBe(`coalesce("item"."published_at", now())`);
    expect(toSql("unlisted")).toBe(toSql("public"));
  });

  it("agrees with the check the table has on the two columns", () => {
    const migration = readFileSync(
      new URL("../../../drizzle/0007_feed_items.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain(
      `CHECK (("item"."visibility" = 'private') = ("item"."published_at" is null))`,
    );
  });
});

describe("taggedWith", () => {
  it("asks for the items with one of the owner's tags, by its slug", () => {
    const { sql, params } = new PgDialect().sqlToQuery(taggedWith("owner-id", "holy-spirit"));
    expect(sql).toBe(
      `exists (select 1 from "item_tag" inner join "tag" on "tag"."id" = "item_tag"."tag_id" where "item_tag"."item_id" = "item"."id" and "tag"."owner_id" = $1 and "tag"."slug" = $2)`,
    );
    expect(params).toEqual(["owner-id", "holy-spirit"]);
  });

  it("has a tag per owner and slug, and an index from a tag to its items", () => {
    const migration = readFileSync(
      new URL("../../../drizzle/0007_feed_items.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain(`CREATE UNIQUE INDEX "tag_owner_slug_idx" ON "tag" USING btree ("owner_id","slug")`);
    expect(migration).toContain(`CREATE INDEX "item_tag_tag_idx" ON "item_tag" USING btree ("tag_id")`);
  });
});

describe("containsPattern", () => {
  it("finds the words anywhere, and takes % and _ as themselves", () => {
    expect(containsPattern("living water")).toBe("%living water%");
    expect(containsPattern("100% sure_ish")).toBe("%100\\% sure\\_ish%");
    expect(containsPattern("back\\slash")).toBe("%back\\\\slash%");
  });
});
