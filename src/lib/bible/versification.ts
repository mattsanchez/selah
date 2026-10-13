import { bookByUsfm } from "./books";
import { toVerseId } from "./verse-id";

// How a translation's own verse numbers map onto canonical verse ids.
//
// All three MVP translations follow the English (KJV) numbering, so almost
// every reference maps to itself. The exceptions are handled in three ways:
//
// - A verse a translation leaves out simply has no row. The BSB follows the
//   critical text and omits John 5:4, Acts 8:37, Romans 16:24 and others;
//   none of BSB, WEB or KJV numbers a 3 John 1:15 (they end the letter at
//   1:14, where the NA28 and ESV split that verse in two). Callers must
//   expect gaps: a canonical id is valid whether or not a translation has it.
// - A verse a translation numbers differently is renumbered at import, listed
//   in RENUMBERED below, so one id always means the same words.
// - Psalm superscriptions are not verses. The Hebrew numbering counts them as
//   verse 1 and shifts the rest of the psalm; the English numbering, used
//   here, leaves them unnumbered, so Psalm 3:1 is "O LORD, how my foes have
//   increased" in every translation. The superscription is stored as a
//   heading of kind "superscription" on verse 1.
export type SourceRef = { usfm: string; chapter: number; verse: number };

type Renumbering = { from: SourceRef; to: SourceRef };

const ref = (usfm: string, chapter: number, verse: number): SourceRef => ({
  usfm,
  chapter,
  verse,
});

// Keyed by translation id.
//
// The WEB prints the closing doxology of Romans after 14:23 as 14:24-26 (its
// own 16:25 is empty but for a footnote saying so). The KJV and BSB number
// the same words 16:25-27, which is the canonical numbering.
export const RENUMBERED: Readonly<Record<string, readonly Renumbering[]>> = {
  web: [
    { from: ref("ROM", 14, 24), to: ref("ROM", 16, 25) },
    { from: ref("ROM", 14, 25), to: ref("ROM", 16, 26) },
    { from: ref("ROM", 14, 26), to: ref("ROM", 16, 27) },
  ],
};

const same = (a: SourceRef, b: SourceRef) =>
  a.usfm === b.usfm && a.chapter === b.chapter && a.verse === b.verse;

// The canonical verse id for a reference as a translation numbers it. Throws
// when the result is not a verse of the canonical versification, so an import
// cannot invent ids.
export function canonicalVerseId(translationId: string, source: SourceRef): number {
  const target =
    RENUMBERED[translationId]?.find((rule) => same(rule.from, source))?.to ?? source;

  const book = bookByUsfm(target.usfm);
  if (!book) throw new RangeError(`Unknown book code: ${target.usfm}`);
  return toVerseId({
    book: book.number,
    chapter: target.chapter,
    verse: target.verse,
  });
}
