import { nextVerseId, previousVerseId, type VerseRange } from "./verse-id";

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
