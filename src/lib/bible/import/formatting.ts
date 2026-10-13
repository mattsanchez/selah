import type { Break, Span, VerseRecord } from "../types";
import { canonicalVerseId } from "../versification";
import type { FormattingKind } from "./sources";
import type { UsfmBook } from "./usfm";

// Why a verse's formatting was left as it was.
// - "text differs": the second source's words for the verse are not the
//   stored words, so its marks cannot be placed exactly.
// - "no such verse": the second source marks a verse the translation does not
//   store.
export type SkipReason = "text differs" | "no such verse";

export type FormattingReport = {
  kind: FormattingKind;
  // Verses the second source has marks for, and how many of them took.
  marked: number;
  applied: number;
  skipped: { verseId: number; reason: SkipReason }[];
  // Paragraph starts added, or red-letter spans added.
  added: number;
  // Paragraph starts the stored data already had.
  alreadyThere: number;
  // Paragraphs that start inside a verse at a place where the stored text has
  // no line break. A break inside a verse must follow a "\n" and the text is
  // not changed, so these are not stored.
  unplaced: { verseId: number; offset: number }[];
};

// Where each character that is not whitespace sits in a text.
function inkOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) offsets.push(i);
  }
  return offsets;
}

const ink = (text: string): string => text.replace(/\s+/g, "");

// Lays the paragraph starts or red-letter spans of a second source onto
// verses that already have their text, and returns the new verses with a
// report. Nothing but `breaks` (for "paragraphs") or `wordsOfJesus` changes.
//
// The two sources space and break their lines differently, so a verse lines up
// when the two texts are the same character for character once whitespace is
// set aside. Each mark then moves to the same character of the stored text. A
// verse whose texts differ in any other way is skipped and reported: no mark
// is ever placed by guesswork.
export function applyFormatting(
  verses: readonly VerseRecord[],
  books: readonly UsfmBook[],
  options: { translationId: string; kind: FormattingKind },
): { verses: VerseRecord[]; report: FormattingReport } {
  const { translationId, kind } = options;
  const result = verses.map((verse) => ({ ...verse }));
  const byId = new Map(result.map((verse) => [verse.verseId, verse]));
  const report: FormattingReport = {
    kind,
    marked: 0,
    applied: 0,
    skipped: [],
    added: 0,
    alreadyThere: 0,
    unplaced: [],
  };

  for (const book of books) {
    for (const source of book.verses) {
      const marks = kind === "paragraphs" ? source.paragraphs : source.wordsOfJesus;
      if (marks.length === 0) continue;
      report.marked++;

      const verseId = canonicalVerseId(translationId, {
        usfm: book.id,
        chapter: source.chapter,
        verse: source.verse,
      });
      const verse = byId.get(verseId);
      if (!verse) {
        report.skipped.push({ verseId, reason: "no such verse" });
        continue;
      }
      if (ink(source.text) !== ink(verse.text)) {
        report.skipped.push({ verseId, reason: "text differs" });
        continue;
      }
      report.applied++;

      const target = inkOffsets(verse.text);
      // How many characters of ink come before an offset in the source text.
      const inkBefore = (offset: number) => ink(source.text.slice(0, offset)).length;

      if (kind === "paragraphs") {
        const breaks: Break[] = [...verse.breaks];
        for (const start of source.paragraphs) {
          const offset = target[inkBefore(start)];
          const at = breaks.findIndex((item) => item.offset === offset);
          if (at >= 0 && breaks[at].kind === "paragraph") {
            report.alreadyThere++;
          } else if (offset === 0) {
            // A verse that was known only to start a new line starts a
            // paragraph.
            if (at >= 0) breaks.splice(at, 1);
            breaks.unshift({ offset: 0, kind: "paragraph" });
            report.added++;
          } else if (verse.text[offset - 1] === "\n") {
            breaks.push({ offset, kind: "paragraph" });
            report.added++;
          } else {
            report.unplaced.push({ verseId, offset });
          }
        }
        verse.breaks = breaks.sort((a, b) => a.offset - b.offset);
      } else {
        const spans: Span[] = [];
        for (const span of source.wordsOfJesus) {
          const [from, to] = [inkBefore(span.start), inkBefore(span.end)];
          if (from === to) continue;
          const start = target[from];
          const end = target[to - 1] + 1;
          const open = spans.at(-1);
          if (open && verse.text.slice(open.end, start).trim() === "") open.end = end;
          else spans.push({ start, end });
        }
        verse.wordsOfJesus = spans;
        report.added += spans.length;
      }
    }
  }

  report.skipped.sort((a, b) => a.verseId - b.verseId);
  report.unplaced.sort((a, b) => a.verseId - b.verseId || a.offset - b.offset);
  return { verses: result, report };
}
