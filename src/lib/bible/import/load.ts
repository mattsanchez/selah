import { and, eq, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { translation, verse } from "@/db/schema";

import type { VerseRecord } from "../types";
import type { BibleSource } from "./sources";

const BATCH = 1000;

// Upserts a translation and its verses in one transaction, so re-running with
// the same input changes nothing. With `prune`, verses of the translation that
// are not in `verses` are deleted, which makes the table match a full import;
// without it, existing verses are left alone, so loading the fixture never
// shrinks a database that holds a full import.
export async function loadTranslation(
  db: Db,
  source: BibleSource,
  verses: readonly VerseRecord[],
  { prune = false } = {},
): Promise<void> {
  const row = {
    id: source.id,
    name: source.name,
    abbrev: source.abbrev,
    license: source.license,
    attribution: source.attribution,
    sourceUrl: source.sourceUrl,
    provider: "local" as const,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(translation)
      .values(row)
      .onConflictDoUpdate({ target: translation.id, set: row });

    for (let i = 0; i < verses.length; i += BATCH) {
      await tx
        .insert(verse)
        .values(
          verses.slice(i, i + BATCH).map((record) => ({
            translationId: source.id,
            ...record,
          })),
        )
        .onConflictDoUpdate({
          target: [verse.translationId, verse.verseId],
          set: {
            text: sql`excluded.text`,
            headings: sql`excluded.headings`,
            footnotes: sql`excluded.footnotes`,
          },
        });
    }

    if (prune) {
      await tx.delete(verse).where(
        and(
          eq(verse.translationId, source.id),
          notInArray(
            verse.verseId,
            verses.map((record) => record.verseId),
          ),
        ),
      );
    }
  });
}

export async function countVerses(db: Db, translationId: string): Promise<number> {
  return db.$count(verse, eq(verse.translationId, translationId));
}
