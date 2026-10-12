import { fetchSource } from "../src/lib/bible/import/download";
import { normalizeTranslation } from "../src/lib/bible/import/helloao";
import { BIBLE_SOURCES, type BibleSource } from "../src/lib/bible/import/sources";
import type { VerseRecord } from "../src/lib/bible/types";

// The sources named on the command line (by id or abbreviation), or all of them.
export function selectSources(args: readonly string[]): BibleSource[] {
  if (args.length === 0) return [...BIBLE_SOURCES];
  return args.map((arg) => {
    const source = BIBLE_SOURCES.find((s) => s.id === arg.toLowerCase());
    if (!source) {
      const known = BIBLE_SOURCES.map((s) => s.id).join(", ");
      throw new Error(`Unknown translation "${arg}". Known: ${known}`);
    }
    return source;
  });
}

// Downloads a pinned source (or reads it from the cache), verifies its
// checksum and normalizes it to verse records.
export async function fetchVerses(
  source: BibleSource,
  books?: readonly string[],
): Promise<VerseRecord[]> {
  const { translation, cached } = await fetchSource(source);
  console.log(
    `${source.abbrev}: ${cached ? "cached" : "downloaded"}, checksum ${source.contentSha256.slice(0, 12)}… verified`,
  );
  return normalizeTranslation(translation, {
    translationId: source.id,
    stripFootnoteOrigin: source.stripFootnoteOrigin,
    stripParagraphMarks: source.stripParagraphMarks,
    books,
  });
}
