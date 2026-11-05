import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { Db } from "@/db/client";

import { DEFAULT_DAILY_CAP, askDay, askKey, dailyCap, normalizePassage, normalizeQuestion, releaseQuestion, reserveQuestion, saveAnswer } from "./store";

// The SQL these send, against a stand-in that records it. The behaviour on real
// rows is journey 8 (e2e/ask.spec.ts).

type Sent = { sql: string; params: unknown[] };

function recordingDb(rows: unknown[] = []) {
  const sent: Sent[] = [];
  const db = drizzle(async (sql, params) => {
    sent.push({ sql, params });
    return { rows };
  });
  return { db: db as unknown as Db, sent };
}

const JOHN = [{ start: 43003016, end: 43003021 }];

describe("normalizeQuestion", () => {
  it("reads the same words as the same question", () => {
    const same = ["What is love?", "  what  IS love ", "What is love??", "What is love."];
    expect(new Set(same.map(normalizeQuestion)).size).toBe(1);
  });

  it("keeps different questions apart", () => {
    expect(normalizeQuestion("What is love?")).not.toBe(normalizeQuestion("What is hope?"));
  });
});

describe("askKey", () => {
  const key = (...args: Parameters<typeof askKey>) => askKey(...args).key;
  const base = key(JOHN, "bsb", "What is love?", "m1");

  it("is the same for the same passage, however it was selected, and the same question", () => {
    const split = [{ start: 43003019, end: 43003021 }, { start: 43003016, end: 43003018 }];
    expect(key(split, "bsb", "what is love", "m1")).toBe(base);
    expect(normalizePassage(split)).toBe("43003016-43003021");
  });

  it("differs by passage, translation, question and model", () => {
    expect(key([{ start: 43003016, end: 43003016 }], "bsb", "What is love?", "m1")).not.toBe(base);
    expect(key(JOHN, "web", "What is love?", "m1")).not.toBe(base);
    expect(key(JOHN, "bsb", "What is hope?", "m1")).not.toBe(base);
    expect(key(JOHN, "bsb", "What is love?", "m2")).not.toBe(base);
  });

  it("reads a follow-up with the questions before it", () => {
    expect(key(JOHN, "bsb", "What is love?", "m1", ["Who wrote this?"])).not.toBe(base);
  });

  it("keeps what it covers readable beside the hash", () => {
    expect(askKey(JOHN, "bsb", "What is love?", "m1")).toMatchObject({ passage: "43003016-43003021", translationId: "bsb", question: "what is love", model: "m1" });
  });
});

describe("the cap", () => {
  it("defaults, and follows the setting", () => {
    expect(dailyCap(undefined)).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCap({ ask: { dailyCap: 7 } })).toBe(7);
  });

  it("takes a question in one statement that stops at the cap", async () => {
    const { db, sent } = recordingDb([{ questions: 1 }]);
    expect(await reserveQuestion(db, 5, "2026-10-30")).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].sql).toContain("on conflict (day) do update");
    expect(sent[0].sql).toContain("ask_usage.questions < $");
    expect(sent[0].params).toEqual(["2026-10-30", 5, 5]);
  });

  it("says no when the statement took nothing", async () => {
    const { db } = recordingDb([]);
    expect(await reserveQuestion(db, 5)).toBe(false);
  });

  it("gives a question back, never below nothing", async () => {
    const { db, sent } = recordingDb([]);
    await releaseQuestion(db, "2026-10-30");
    expect(sent[0].sql).toContain("greatest(");
  });

  it("counts days in UTC", () => {
    expect(askDay(new Date("2026-10-30T23:59:59-07:00"))).toBe("2026-10-31");
  });
});

describe("saveAnswer", () => {
  it("replaces what was saved, so Ask again keeps the newer answer", async () => {
    const { db, sent } = recordingDb([]);
    const key = askKey(JOHN, "bsb", "q", "m");
    await saveAnswer(db, key, { answer: { sections: [], dropped: [] }, sources: { reference: "", translation: { id: "", abbrev: "", name: "", attribution: "", sourceUrl: "" }, verses: [], commentary: [], leftOut: [] } });
    expect(sent[0].sql).toContain('on conflict ("key") do update');
  });
});
