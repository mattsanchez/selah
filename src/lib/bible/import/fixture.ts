import { readFile } from "node:fs/promises";

import type { VerseRecord } from "../types";

// The committed test fixture: John, Psalms and Romans of each translation,
// one file per translation, written by `pnpm fixture:bible` from the pinned
// sources. Empty `headings` and `footnotes` are left out of the file.
type FixtureVerse = Pick<VerseRecord, "verseId" | "text"> &
  Partial<Pick<VerseRecord, "headings" | "footnotes">>;

type FixtureFile = {
  translation: string;
  // The pin of the source the file was built from.
  sourceSha256: string;
  verses: FixtureVerse[];
};

export const fixtureUrl = (translationId: string): URL =>
  new URL(`../../../db/seed/fixtures/bible/${translationId}.json`, import.meta.url);

// One verse per line, so a change to the fixture reads as a line diff.
export function serializeFixture(
  translationId: string,
  sourceSha256: string,
  verses: readonly VerseRecord[],
): string {
  const lines = verses.map(({ verseId, text, headings, footnotes }) =>
    JSON.stringify({
      verseId,
      text,
      ...(headings.length > 0 && { headings }),
      ...(footnotes.length > 0 && { footnotes }),
    }),
  );
  return (
    `{"translation":${JSON.stringify(translationId)},"sourceSha256":${JSON.stringify(sourceSha256)},"verses":[\n` +
    `${lines.join(",\n")}\n]}\n`
  );
}

export async function readFixture(translationId: string): Promise<VerseRecord[]> {
  const file = JSON.parse(
    await readFile(fixtureUrl(translationId), "utf8"),
  ) as FixtureFile;
  return file.verses.map((verse) => ({
    verseId: verse.verseId,
    text: verse.text,
    headings: verse.headings ?? [],
    footnotes: verse.footnotes ?? [],
  }));
}
