import { describe, expect, it } from "vitest";

import { databaseUrl, DEFAULT_DATABASE_URL } from "./env";

describe("databaseUrl", () => {
  it("falls back to the compose database", () => {
    expect(databaseUrl({})).toBe(DEFAULT_DATABASE_URL);
    expect(databaseUrl({ DATABASE_URL: "" })).toBe(DEFAULT_DATABASE_URL);
  });

  it("uses DATABASE_URL when set", () => {
    const url = "postgres://u:p@db.example:5433/other";
    expect(databaseUrl({ DATABASE_URL: url })).toBe(url);
  });
});
