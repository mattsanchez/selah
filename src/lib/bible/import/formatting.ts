import type { Break, Span, VerseRecord } from "../types";
import { canonicalVerseId } from "../versification";
import type { FormattingKind } from "./sources";
import type { UsfmBook, UsfmVerse } from "./usfm";

// Why a verse's formatting was left as it was.
// - "text differs": the second source's words for the verse are not the
//   stored words, so its marks cannot be placed exactly. For red-letter text
//   this includes a verse whose words agree but whose punctuation differs
//   right where a span starts or ends.
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
  // Paragraphs that start inside a verse, at a place where the stored text
  // had a space: the space is now a "\n", which a break inside a verse must
  // follow. This is the only change the import makes to a verse's text.
  lineBreaks: number;
  // Paragraphs that start inside a verse at a place where the stored text has
  // neither a line break nor a single space to make one of. Not stored.
  unplaced: { verseId: number; offset: number }[];
  // Verses with red-letter text that were marked although their punctuation
  // differs between the two sources: a bracketed closing quotation mark at
  // the end, or a stretch clear of where any span starts or ends.
  punctuationDiffers: number[];
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

// A closing quotation mark in square brackets at the end of a verse. The
// BSB's USFM prints one where a speech stops at the end of a paragraph without
// its quotation mark; the stored text does not have it.
const BRACKETED_CLOSE = /\s*\[[’”]+\]$/;

// The verse without a bracketed closing quotation mark at its end, with any
// red-letter span that ran over the mark ending before it.
function withoutBracketedClose(source: UsfmVerse): UsfmVerse {
  const cut = source.text.search(BRACKETED_CLOSE);
  if (cut < 0) return source;
  return {
    ...source,
    text: source.text.slice(0, cut),
    wordsOfJesus: source.wordsOfJesus
      .map(({ start, end }) => ({ start, end: Math.min(end, cut) }))
      .filter(({ start, end }) => start < end),
  };
}

const WORD = /[\p{L}\p{N}]/u;

// Lines up two texts (as ink) that differ in one stretch of punctuation: a
// comma one has and the other lacks, or "…" against "...". Returns where each
// character of `from` outside that stretch sits in `to`, or undefined when
// the texts differ in more than punctuation.
function acrossPunctuation(
  from: string,
  to: string,
): ((index: number) => number | undefined) | undefined {
  const shortest = Math.min(from.length, to.length);
  let head = 0;
  while (head < shortest && from[head] === to[head]) head++;
  let tail = 0;
  while (tail < shortest - head && from.at(-1 - tail) === to.at(-1 - tail)) tail++;
  const differing = from.slice(head, from.length - tail) + to.slice(head, to.length - tail);
  if (WORD.test(differing)) return undefined;
  return (index) =>
    index < head
      ? index
      : index >= from.length - tail
        ? index + to.length - from.length
        : undefined;
}

// Lays the paragraph starts or red-letter spans of a second source onto
// verses that already have their text, and returns the new verses with a
// report. For "wordsOfJesus" nothing but `wordsOfJesus` changes. For
// "paragraphs" `breaks` changes, and where a paragraph starts inside a verse
// the space before it in `text` becomes a "\n"; no other character of a text
// changes, and none moves.
//
// The two sources space and break their lines differently, so a verse lines up
// when the two texts are the same character for character once whitespace is
// set aside. Each mark then moves to the same character of the stored text. A
// verse whose texts differ in any other way is skipped and reported: no mark
// is ever placed by guesswork.
//
// Red-letter text allows for two differences in punctuation, neither of which
// leaves a span's place in doubt: a bracketed closing quotation mark at the
// end of the source's verse is set aside, and a verse that otherwise differs
// in one stretch of punctuation is marked when every span starts and ends on
// a character outside that stretch.
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
    lineBreaks: 0,
    unplaced: [],
    punctuationDiffers: [],
  };

  for (const book of books) {
    for (let source of book.verses) {
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
      const stored = ink(verse.text);
      // Where a character of the source's ink sits in the stored ink.
      let place: ((index: number) => number | undefined) | undefined;
      const exact = ink(source.text) === stored;
      if (exact) {
        place = (index) => index;
      } else if (kind === "wordsOfJesus") {
        const trimmed = withoutBracketedClose(source);
        if (ink(trimmed.text) === stored) {
          source = trimmed;
          place = (index) => index;
        } else {
          place = acrossPunctuation(ink(source.text), stored);
        }
      }

      const text = source.text;
      const target = inkOffsets(verse.text);
      // How many characters of ink come before an offset in the source text.
      const inkBefore = (offset: number) => ink(text.slice(0, offset)).length;
      // The spans of the source in the stored text; undefined when one starts
      // or ends where the two texts differ.
      const spans: Span[] | undefined = place && [];
      if (place && spans && kind === "wordsOfJesus") {
        for (const span of source.wordsOfJesus) {
          const [from, to] = [inkBefore(span.start), inkBefore(span.end)];
          if (from === to) continue;
          const [first, last] = [place(from), place(to - 1)];
          if (first === undefined || last === undefined) {
            place = undefined;
            break;
          }
          const start = target[first];
          const end = target[last] + 1;
          const open = spans.at(-1);
          if (open && verse.text.slice(open.end, start).trim() === "") open.end = end;
          else spans.push({ start, end });
        }
      }
      if (!place || !spans) {
        report.skipped.push({ verseId, reason: "text differs" });
        continue;
      }
      report.applied++;

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
          } else if (/\s/.test(verse.text[offset - 1]) && !/\s/.test(verse.text[offset - 2])) {
            // One space stands between the two paragraphs: it becomes the
            // line break. Both are one code unit, so no offset moves.
            verse.text = `${verse.text.slice(0, offset - 1)}\n${verse.text.slice(offset)}`;
            breaks.push({ offset, kind: "paragraph" });
            report.added++;
            report.lineBreaks++;
          } else {
            report.unplaced.push({ verseId, offset });
          }
        }
        verse.breaks = breaks.sort((a, b) => a.offset - b.offset);
      } else {
        if (!exact) report.punctuationDiffers.push(verseId);
        verse.wordsOfJesus = spans;
        report.added += spans.length;
      }
    }
  }

  report.skipped.sort((a, b) => a.verseId - b.verseId);
  report.punctuationDiffers.sort((a, b) => a - b);
  report.unplaced.sort((a, b) => a.verseId - b.verseId || a.offset - b.offset);
  return { verses: result, report };
}
