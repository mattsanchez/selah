import { createHash } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { askAnswer, askUsage } from "@/db/schema";
import { normalizeRanges } from "@/lib/bible/ranges";
import type { VerseRange } from "@/lib/bible/verse-id";
import type { SiteSettings } from "@/lib/site-settings";

import { ANSWER_VERSION } from "./prompt";
import type { SavedAnswer } from "./store-types";

// The two things that keep Ask's cost in hand: an answer given once is saved
// and given again for nothing, and a day has a cap on the questions that reach
// the model. A saved answer does not count; "Ask again" does.

export const DEFAULT_DAILY_CAP = 50;

export const dailyCap = (settings: SiteSettings | undefined) => settings?.ask?.dailyCap ?? DEFAULT_DAILY_CAP;

// A question as it is compared: the same words, however they are typed.
export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[\s?.!]+$/, "")
    .trim();
}

// "43003016-43003021" for the passage, in reading order, however it was selected.
export const normalizePassage = (ranges: readonly VerseRange[]) =>
  normalizeRanges(ranges)
    .map(({ start, end }) => `${start}-${end}`)
    .join(",");

export type AskKey = {
  key: string;
  passage: string;
  translationId: string;
  question: string;
  model: string;
};

// A follow-up means something else after other questions, so the questions
// before it are part of what it is. The first question has none.
export function askKey(
  ranges: readonly VerseRange[],
  translationId: string,
  question: string,
  model: string,
  before: readonly string[] = [],
): AskKey {
  const passage = normalizePassage(ranges);
  const asked = [...before, question].map(normalizeQuestion);
  const key = createHash("sha256")
    .update(JSON.stringify([ANSWER_VERSION, passage, translationId, asked, model]))
    .digest("hex");
  return { key, passage, translationId, question: asked.join(" / "), model };
}

export async function findAnswer(db: Db, key: string): Promise<{ saved: SavedAnswer; createdAt: Date } | undefined> {
  const [row] = await db
    .select({ answer: askAnswer.answer, createdAt: askAnswer.createdAt })
    .from(askAnswer)
    .where(eq(askAnswer.key, key));
  return row && { saved: row.answer, createdAt: row.createdAt };
}

// Replaces what was saved: "Ask again" gets the newer answer.
export async function saveAnswer(db: Db, key: AskKey, answer: SavedAnswer): Promise<void> {
  await db
    .insert(askAnswer)
    .values({ ...key, answer })
    .onConflictDoUpdate({ target: askAnswer.key, set: { answer, createdAt: sql`now()` } });
}

export async function clearAnswers(db: Db): Promise<void> {
  await db.delete(askAnswer);
}

export async function countAnswers(db: Db): Promise<number> {
  const [row] = await db.select({ value: count() }).from(askAnswer);
  return row?.value ?? 0;
}

// Today, as the cap counts days.
export const askDay = (now = new Date()) => now.toISOString().slice(0, 10);

// Takes one of the day's questions, or says none is left. One statement, so
// two questions at once cannot both take the last.
export async function reserveQuestion(db: Db, cap: number, day = askDay()): Promise<boolean> {
  const rows = await db.execute<{ questions: number }>(sql`
    insert into ask_usage (day, questions)
    select ${day}, 1 where ${cap}::int > 0
    on conflict (day) do update set questions = ask_usage.questions + 1
    where ask_usage.questions < ${cap}::int
    returning questions`);
  return rows.length > 0;
}

// Gives a question back: it never reached the model, or nothing came of it.
export async function releaseQuestion(db: Db, day: string): Promise<void> {
  await db
    .update(askUsage)
    .set({ questions: sql`greatest(${askUsage.questions} - 1, 0)` })
    .where(eq(askUsage.day, day));
}

export async function questionsUsed(db: Db, day = askDay()): Promise<number> {
  const [row] = await db.select({ questions: askUsage.questions }).from(askUsage).where(eq(askUsage.day, day));
  return row?.questions ?? 0;
}
