import { coversVerse, intersectRanges, normalizeRanges, removeVerse } from "@/lib/bible/ranges";
import { parseReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";

// Which verses of the passage on show are selected.
//
// The selection lives in the URL, as the `v` parameter of a reader page (see
// src/lib/reader-url.ts), written like a reference: "john-3.16", or
// "john-3.16-18,20" for a run of verses and one apart from it. It is always
// normalized: the fewest ranges, in reading order (src/lib/bible/ranges.ts).
//
// One selection serves everything done with verses: the study panel is about
// its first verse, and a highlight is made of all of it. The click handling
// (src/components/study/verse-select.tsx) only asks nextSelection() what the
// selection becomes and navigates there.

// The selection a `v` parameter asks for: the ranges it names that lie
// wholly within the passage. Empty when it names none.
export function parseSelection(
  param: string | undefined,
  passage: readonly VerseRange[],
): VerseRange[] {
  if (!param) return [];
  const parsed = parseReference(param);
  if (!parsed.ok) return [];
  const within = parsed.ranges.filter(
    (range) => coversVerse(passage, range.start) && coversVerse(passage, range.end),
  );
  // A range may start in one part of the passage and end in another
  // ("John 3:16-18; 4:1-3"); only the verses on show are selected.
  return intersectRanges(within, passage);
}

export const isSelected = (verseId: number, selection: readonly VerseRange[]) =>
  coversVerse(selection, verseId);

// The verse the study panel is about: the first one selected.
export function studyVerse(selection: readonly VerseRange[]): number | undefined {
  return selection[0]?.start;
}

// What a click on a verse does to the selection.
// - "replace": a plain click or tap. Selects that verse alone.
// - "toggle": adds the verse, or removes it if it is selected. A click with
//   Ctrl or Command held, or any click while adding verses (the `add`
//   parameter), which is how a touch screen and the keyboard select verses
//   that are apart.
// - "extend": a click with Shift held. Selects every verse from the selection
//   to the clicked one.
export type SelectMode = "replace" | "toggle" | "extend";

// What the selection becomes when a verse is clicked. `passage` keeps a
// selection that is extended across a gap in the passage to the verses on
// show.
export function nextSelection(
  current: readonly VerseRange[],
  verseId: number,
  mode: SelectMode = "replace",
  passage?: readonly VerseRange[],
): VerseRange[] {
  const verse = { start: verseId, end: verseId };
  const selected = normalizeRanges(current);

  if (mode === "replace" || selected.length === 0) {
    // Clicking the only verse selected clears the selection.
    const only = selected.length === 1 && selected[0].start === verseId && selected[0].end === verseId;
    return only ? [] : [verse];
  }
  if (mode === "toggle") {
    return coversVerse(selected, verseId)
      ? removeVerse(selected, verseId)
      : normalizeRanges([...selected, verse]);
  }

  // Extend: from the selected verses before the clicked one up to it, or,
  // when it comes before all of them, from it down to the first.
  if (coversVerse(selected, verseId)) return selected;
  const before = selected.findLast((range) => range.end < verseId);
  const stretch = before
    ? { start: before.start, end: verseId }
    : { start: verseId, end: selected[0].end };
  const extended = normalizeRanges([...selected, stretch]);
  return passage ? intersectRanges(extended, passage) : extended;
}
