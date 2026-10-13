import { readFileSync } from "node:fs";

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { overlapsPassage } from "./queries";

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
