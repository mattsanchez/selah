import { coversVerse, intersectRanges } from "@/lib/bible/ranges";
import type { VerseRange } from "@/lib/bible/verse-id";

// How highlights show in the reader: which color each verse on show gets,
// where a highlight's note is reached from, and which highlights have no
// verse on show at all. Pure functions over what src/lib/items/queries.ts
// returns; src/components/passage prints the result.

// What this needs of an item.
export type Highlight = {
  id: string;
  color: string | null;
  note: string | null;
  createdAt: Date;
  passages: readonly VerseRange[];
};

// What a verse looks like.
export type VerseMark = {
  // The color of the newest highlight on the verse: its background.
  color: string;
  // Where highlights overlap, the color of the newest one of another color:
  // a stripe along the bottom of the text.
  under?: string;
  // How many highlights are on the verse.
  count: number;
};

// A note to reach from the text, printed after the last verse of its
// highlight that is on show.
export type NoteMarker = {
  id: string;
  note: string;
  // The highlight's verses within the passage: what the marker selects.
  ranges: VerseRange[];
};

export type PlacedHighlights = {
  mark: (verseId: number) => VerseMark | undefined;
  notes: (verseId: number) => readonly NoteMarker[];
  // Highlights on the passage with none of their verses on show: every
  // verse they are on is one the translations on show leave out.
  hidden: Highlight[];
};

const newestFirst = (a: Highlight, b: Highlight) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);

// The mark of one verse, given the highlights that may be on it.
export function verseMark(
  highlights: readonly Highlight[],
  verseId: number,
): VerseMark | undefined {
  const on = highlights
    .filter((highlight) => highlight.color && coversVerse(highlight.passages, verseId))
    .sort(newestFirst);
  if (on.length === 0) return undefined;
  const color = on[0].color!;
  const under = on.find((highlight) => highlight.color !== color)?.color ?? undefined;
  return { color, ...(under ? { under } : {}), count: on.length };
}

// Places highlights on a passage. `shown` lists the verses that are printed:
// those at least one translation on show has.
export function placeHighlights(
  highlights: readonly Highlight[],
  passage: readonly VerseRange[],
  shown: readonly number[],
): PlacedHighlights {
  const notes = new Map<number, NoteMarker[]>();
  const hidden: Highlight[] = [];
  const visible: Highlight[] = [];
  const ordered = [...shown].sort((a, b) => a - b);

  for (const highlight of [...highlights].sort(newestFirst).reverse()) {
    const ranges = intersectRanges(highlight.passages, passage);
    if (ranges.length === 0) continue;
    const last = ordered.findLast((verseId) => coversVerse(ranges, verseId));
    if (last === undefined) {
      hidden.push(highlight);
      continue;
    }
    visible.push(highlight);
    if (highlight.note) {
      const at = notes.get(last) ?? [];
      at.push({ id: highlight.id, note: highlight.note, ranges });
      notes.set(last, at);
    }
  }

  const marks = new Map<number, VerseMark | undefined>();
  return {
    mark(verseId) {
      if (!marks.has(verseId)) marks.set(verseId, verseMark(visible, verseId));
      return marks.get(verseId);
    },
    notes: (verseId) => notes.get(verseId) ?? [],
    hidden,
  };
}

// The highlights with a verse in common with `ranges`, oldest first.
export function highlightsOn<T extends Highlight>(
  highlights: readonly T[],
  ranges: readonly VerseRange[],
): T[] {
  return highlights
    .filter((highlight) => intersectRanges(highlight.passages, ranges).length > 0)
    .sort(newestFirst)
    .reverse();
}
