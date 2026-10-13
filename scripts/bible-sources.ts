import { fetchFormatting, fetchSource } from "../src/lib/bible/import/download";
import {
  applyFormatting,
  type FormattingReport,
} from "../src/lib/bible/import/formatting";
import { normalizeTranslation } from "../src/lib/bible/import/helloao";
import { BIBLE_SOURCES, type BibleSource } from "../src/lib/bible/import/sources";
import type { VerseRecord } from "../src/lib/bible/types";
import { formatVerseId } from "../src/lib/bible/verse-id";

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

// What a formatting source added, and every verse it could not be used for.
function describe(report: FormattingReport): string {
  const what = report.kind === "paragraphs" ? "paragraph starts" : "red-letter spans";
  const lines = [
    `${report.added} ${what} added; ${report.applied} of the ${report.marked} verses it marks lined up`,
  ];
  if (report.kind === "paragraphs") {
    lines.push(
      `${report.alreadyThere} were there already; ${report.unplaced.length} start inside a verse ` +
        "where the text has no line break, and are not stored",
    );
  }
  if (report.skipped.length > 0) {
    const verses = report.skipped
      .map(({ verseId, reason }) => `${formatVerseId(verseId)} (${reason})`)
      .join(", ");
    lines.push(`${report.skipped.length} verses skipped: ${verses}`);
  }
  return lines.join("\n  ");
}

// Downloads a pinned source (or reads it from the cache), verifies its
// checksum and normalizes it to verse records. A translation with a
// formatting source then gets that source's paragraphs or red-letter spans
// laid onto the same verses; their text does not change.
export async function fetchVerses(
  source: BibleSource,
  books?: readonly string[],
): Promise<VerseRecord[]> {
  const { translation, cached } = await fetchSource(source);
  console.log(
    `${source.abbrev}: ${cached ? "cached" : "downloaded"}, checksum ${source.contentSha256.slice(0, 12)}… verified`,
  );
  const verses = normalizeTranslation(translation, {
    translationId: source.id,
    stripFootnoteOrigin: source.stripFootnoteOrigin,
    pilcrowParagraphs: source.pilcrowParagraphs,
    books,
  });

  const { formatting } = source;
  if (!formatting) return verses;
  const usfm = await fetchFormatting({ ...source, formatting });
  console.log(
    `${source.abbrev}: formatting ${usfm.cached ? "cached" : "downloaded"}, checksum ${formatting.contentSha256.slice(0, 12)}… verified`,
  );
  const formatted = applyFormatting(
    verses,
    usfm.books.filter((book) => !books || books.includes(book.id)),
    { translationId: source.id, kind: formatting.kind },
  );
  console.log(`${source.abbrev}: ${describe(formatted.report)}`);
  return formatted.verses;
}
