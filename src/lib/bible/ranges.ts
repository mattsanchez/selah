import { bookByNumber } from "./books";
import { nextVerseId, parseVerseId, previousVerseId, type VerseRange } from "./verse-id";

// Arithmetic on lists of verse ranges: what the verse selection and the
// passages of an item are made of. A range is inclusive, and both of its ends
// are canonical verse ids.

export const rangesOverlap = (a: VerseRange, b: VerseRange) =>
  a.start <= b.end && b.start <= a.end;

export const coversVerse = (ranges: readonly VerseRange[], verseId: number) =>
  ranges.some((range) => verseId >= range.start && verseId <= range.end);

// The same verses as the fewest ranges, in reading order: overlapping ranges
// are joined, and so are ranges that are next to each other (John 3:36 and
// 4:1 are, though their ids are far apart).
export function normalizeRanges(ranges: readonly VerseRange[]): VerseRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: VerseRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && (range.start <= last.end || range.start === nextVerseId(last.end))) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// The verses that are in both lists, normalized.
export function intersectRanges(
  a: readonly VerseRange[],
  b: readonly VerseRange[],
): VerseRange[] {
  const both: VerseRange[] = [];
  for (const x of a) {
    for (const y of b) {
      if (rangesOverlap(x, y)) {
        both.push({ start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) });
      }
    }
  }
  return normalizeRanges(both);
}

// The ranges without one verse; a range it was inside is split in two.
export function removeVerse(ranges: readonly VerseRange[], verseId: number): VerseRange[] {
  return normalizeRanges(
    ranges.flatMap((range) => {
      if (verseId < range.start || verseId > range.end) return [range];
      const before = previousVerseId(verseId);
      const after = nextVerseId(verseId);
      return [
        ...(verseId > range.start && before !== undefined
          ? [{ start: range.start, end: before }]
          : []),
        ...(verseId < range.end && after !== undefined ? [{ start: after, end: range.end }] : []),
      ];
    }),
  );
}

// How many verses of the canonical versification the ranges hold, counting a
// verse in two of them twice.
export function countVerses(ranges: readonly VerseRange[]): number {
  let count = 0;
  for (const { start, end } of ranges) {
    const from = parseVerseId(start);
    const to = parseVerseId(end);
    if (!from || !to) continue;
    for (let book = from.book; book <= to.book; book++) {
      const chapters = bookByNumber(book)?.verseCounts ?? [];
      const firstChapter = book === from.book ? from.chapter : 1;
      const lastChapter = book === to.book ? to.chapter : chapters.length;
      for (let chapter = firstChapter; chapter <= lastChapter; chapter++) {
        const first = book === from.book && chapter === from.chapter ? from.verse : 1;
        const last =
          book === to.book && chapter === to.chapter ? to.verse : (chapters[chapter - 1] ?? 0);
        count += Math.max(0, last - first + 1);
      }
    }
  }
  return count;
}
