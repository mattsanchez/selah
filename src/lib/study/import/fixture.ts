import { readFile } from "node:fs/promises";

import type { VerseRange } from "@/lib/bible/verse-id";

import type { CommentaryRecord, CrossRef } from "../types";

// The committed test fixture: the cross references from, and the commentary
// and notes on, FIXTURE_PASSAGES (../sources.ts), written by
// `pnpm fixture:study` from the pinned sources. One file for the cross
// references and one for each commentary source, a row to a line.

type CrossReferenceFile = {
  sourceSha256: string;
  // [fromVerse, toStart, toEnd, votes]
  rows: [number, number, number, number][];
};

type CommentaryFile = { source: string; sourceSha256: string; entries: CommentaryRecord[] };

export const studyFixtureUrl = (name: string): URL =>
  new URL(`../../../db/seed/fixtures/study/${name}.json`, import.meta.url);

const overlaps = (start: number, end: number, passages: readonly VerseRange[]) =>
  passages.some((passage) => start <= passage.end && end >= passage.start);

export function fixtureCrossReferences(
  rows: readonly CrossRef[],
  passages: readonly VerseRange[],
): CrossRef[] {
  return rows
    .filter((row) => overlaps(row.fromVerse, row.fromVerse, passages))
    .sort((a, b) => a.fromVerse - b.fromVerse || b.votes - a.votes || a.toStart - b.toStart);
}

export function fixtureCommentary(
  records: readonly CommentaryRecord[],
  passages: readonly VerseRange[],
): CommentaryRecord[] {
  return records.filter((record) => overlaps(record.verseStart, record.verseEnd, passages));
}

export function serializeCrossReferences(sourceSha256: string, rows: readonly CrossRef[]): string {
  const lines = rows.map((row) =>
    JSON.stringify([row.fromVerse, row.toStart, row.toEnd, row.votes]),
  );
  return `{"sourceSha256":${JSON.stringify(sourceSha256)},"rows":[\n${lines.join(",\n")}\n]}\n`;
}

export function serializeCommentary(
  sourceId: string,
  sourceSha256: string,
  records: readonly CommentaryRecord[],
): string {
  const lines = records.map(({ verseStart, verseEnd, html }) =>
    JSON.stringify({ verseStart, verseEnd, html }),
  );
  return (
    `{"source":${JSON.stringify(sourceId)},"sourceSha256":${JSON.stringify(sourceSha256)},` +
    `"entries":[\n${lines.join(",\n")}\n]}\n`
  );
}

export async function readCrossReferenceFixture(): Promise<CrossRef[]> {
  const file = JSON.parse(
    await readFile(studyFixtureUrl("cross-references"), "utf8"),
  ) as CrossReferenceFile;
  return file.rows.map(([fromVerse, toStart, toEnd, votes]) => ({
    fromVerse,
    toStart,
    toEnd,
    votes,
  }));
}

export async function readCommentaryFixture(sourceId: string): Promise<CommentaryRecord[]> {
  const file = JSON.parse(await readFile(studyFixtureUrl(sourceId), "utf8")) as CommentaryFile;
  return file.entries;
}
