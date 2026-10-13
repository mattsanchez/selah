import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import type { Db } from "@/db/client";
import { commentaryEntry, commentarySource, crossRef } from "@/db/schema";
import { bookRange, parseVerseId, type VerseRange } from "@/lib/bible/verse-id";

import type { CommentaryRecord, CrossRef } from "./types";

export type CommentarySourceRow = typeof commentarySource.$inferSelect;

// The cross references from the verses of a range, best-voted first. Readers
// vote a poor pairing below zero; `minVotes` leaves those out by default.
export async function getCrossReferences(
  db: Db,
  range: VerseRange,
  { minVotes = 0, limit }: { minVotes?: number; limit?: number } = {},
): Promise<CrossRef[]> {
  const query = db
    .select()
    .from(crossRef)
    .where(
      and(
        gte(crossRef.fromVerse, range.start),
        lte(crossRef.fromVerse, range.end),
        gte(crossRef.votes, minVotes),
      ),
    )
    .orderBy(desc(crossRef.votes), asc(crossRef.toStart), asc(crossRef.toEnd));
  return limit === undefined ? query : query.limit(limit);
}

export type SourceCommentary = {
  source: CommentarySourceRow;
  // The entries whose range overlaps the one asked for, the most specific
  // (the shortest range) first.
  entries: CommentaryRecord[];
};

// Every commentary and study-note entry that covers any verse of a range,
// grouped by source in display order. Sources with nothing on it are left out.
export async function getCommentary(db: Db, range: VerseRange): Promise<SourceCommentary[]> {
  // No entry crosses from one book into the next, so one that reaches the
  // range starts in its first book or later. This bounds the index scan.
  const book = parseVerseId(range.start)?.book;
  if (book === undefined) return [];

  const rows = await db
    .select({
      source: commentarySource,
      verseStart: commentaryEntry.verseStart,
      verseEnd: commentaryEntry.verseEnd,
      html: commentaryEntry.html,
    })
    .from(commentaryEntry)
    .innerJoin(commentarySource, eq(commentarySource.id, commentaryEntry.sourceId))
    .where(
      and(
        gte(commentaryEntry.verseStart, bookRange(book).start),
        lte(commentaryEntry.verseStart, range.end),
        gte(commentaryEntry.verseEnd, range.start),
      ),
    )
    .orderBy(asc(commentarySource.position), asc(commentarySource.id));

  const groups = new Map<string, SourceCommentary>();
  for (const { source, ...entry } of rows) {
    const group = groups.get(source.id) ?? { source, entries: [] };
    group.entries.push(entry);
    groups.set(source.id, group);
  }
  const width = (entry: CommentaryRecord) => entry.verseEnd - entry.verseStart;
  for (const group of groups.values()) {
    group.entries.sort((a, b) => width(a) - width(b) || a.verseStart - b.verseStart);
  }
  return [...groups.values()];
}
