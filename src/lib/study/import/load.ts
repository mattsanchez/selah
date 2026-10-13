import { eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { commentaryEntry, commentarySource, crossRef } from "@/db/schema";

import type { CommentarySource } from "../sources";
import type { CommentaryRecord, CrossRef } from "../types";

const BATCH = 2000;
// Commentary entries run to tens of kilobytes each.
const ENTRY_BATCH = 200;

// Upserts cross references in one transaction, so re-running with the same
// input changes nothing. With `replace`, the table is emptied first, which
// makes it match a full import; without it, existing rows are left alone, so
// loading the fixture never shrinks a database that holds a full import.
export async function loadCrossReferences(
  db: Db,
  rows: readonly CrossRef[],
  { replace = false } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    if (replace) await tx.delete(crossRef);
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx
        .insert(crossRef)
        .values(rows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [crossRef.fromVerse, crossRef.toStart, crossRef.toEnd],
          set: { votes: sql`excluded.votes` },
        });
    }
  });
}

// Upserts a commentary source and its entries in one transaction. `replace`
// is as for loadCrossReferences, for the entries of this source.
export async function loadCommentary(
  db: Db,
  source: CommentarySource,
  records: readonly CommentaryRecord[],
  { replace = false } = {},
): Promise<void> {
  const row = {
    id: source.id,
    name: source.name,
    kind: source.kind,
    license: source.license,
    attribution: source.attribution,
    sourceUrl: source.sourceUrl,
    position: source.position,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(commentarySource)
      .values(row)
      .onConflictDoUpdate({ target: commentarySource.id, set: row });
    if (replace) await tx.delete(commentaryEntry).where(eq(commentaryEntry.sourceId, source.id));
    for (let i = 0; i < records.length; i += ENTRY_BATCH) {
      await tx
        .insert(commentaryEntry)
        .values(
          records.slice(i, i + ENTRY_BATCH).map((record) => ({ sourceId: source.id, ...record })),
        )
        .onConflictDoUpdate({
          target: [commentaryEntry.sourceId, commentaryEntry.verseStart, commentaryEntry.verseEnd],
          set: { html: sql`excluded.html` },
        });
    }
  });
}

export async function countCrossReferences(db: Db): Promise<number> {
  return db.$count(crossRef);
}

export async function countCommentary(db: Db, sourceId: string): Promise<number> {
  return db.$count(commentaryEntry, eq(commentaryEntry.sourceId, sourceId));
}
