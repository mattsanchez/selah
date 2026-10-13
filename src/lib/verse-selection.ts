import { parseReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";

// Which verses of the passage on show are selected.
//
// The selection lives in the URL, as the `v` parameter of a reader page (see
// src/lib/reader-url.ts), written like a reference: "john-3.16". It is a list
// of verse ranges so that it can grow: today a click selects one verse, which
// opens the study panel on it; selecting several verses to highlight them
// extends nextSelection() below and nothing else. The click handling
// (src/components/study/verse-select.tsx) only asks it what the selection
// becomes and navigates there.

const inside = (verseId: number, ranges: readonly VerseRange[]) =>
  ranges.some((range) => verseId >= range.start && verseId <= range.end);

// The selection a `v` parameter asks for: the ranges it names that lie
// wholly within the passage. Empty when it names none.
export function parseSelection(
  param: string | undefined,
  passage: readonly VerseRange[],
): VerseRange[] {
  if (!param) return [];
  const parsed = parseReference(param);
  if (!parsed.ok) return [];
  return parsed.ranges.filter(
    (range) => inside(range.start, passage) && inside(range.end, passage),
  );
}

export const isSelected = (verseId: number, selection: readonly VerseRange[]) =>
  inside(verseId, selection);

// The verse the study panel is about: the first one selected.
export function studyVerse(selection: readonly VerseRange[]): number | undefined {
  return selection[0]?.start;
}

// What the selection becomes when a verse is clicked: that verse alone, or
// nothing when it was the only verse selected.
export function nextSelection(
  current: readonly VerseRange[],
  verseId: number,
): VerseRange[] {
  const only =
    current.length === 1 && current[0].start === verseId && current[0].end === verseId;
  return only ? [] : [{ start: verseId, end: verseId }];
}
