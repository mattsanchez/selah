import { and, between, inArray, or } from "drizzle-orm";

import type { Db } from "@/db/client";
import { translation, verse } from "@/db/schema";

import type { VerseRecord } from "./types";
import type { VerseRange } from "./verse-id";

export type Translation = typeof translation.$inferSelect;

// Every translation, in the order given by `first`, then by abbreviation.
export async function listTranslations(db: Db, first?: string): Promise<Translation[]> {
  const rows = await db.select().from(translation);
  return rows.sort(
    (a, b) =>
      Number(b.id === first) - Number(a.id === first) || a.abbrev.localeCompare(b.abbrev),
  );
}

// The verses each translation has in each range: `result.get(id)[r]` lists,
// in reading order, the verses of `ranges[r]`. A verse the translation leaves
// out is absent, so a list may be shorter than its range, or empty.
export async function getPassages(
  db: Db,
  translationIds: readonly string[],
  ranges: readonly VerseRange[],
): Promise<Map<string, VerseRecord[][]>> {
  const result = new Map<string, VerseRecord[][]>(
    translationIds.map((id) => [id, ranges.map(() => [])]),
  );
  if (translationIds.length === 0 || ranges.length === 0) return result;

  const rows = await db
    .select()
    .from(verse)
    .where(
      and(
        inArray(verse.translationId, [...translationIds]),
        or(...ranges.map((range) => between(verse.verseId, range.start, range.end))),
      ),
    )
    .orderBy(verse.verseId);

  for (const { translationId, ...record } of rows) {
    const lists = result.get(translationId);
    ranges.forEach((range, r) => {
      if (record.verseId >= range.start && record.verseId <= range.end) {
        lists?.[r].push(record);
      }
    });
  }
  return result;
}
