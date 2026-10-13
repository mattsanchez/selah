import { chapterLabel } from "./reference";
import type { Footnote, Heading, Span, VerseRecord } from "./types";
import { parseVerseId } from "./verse-id";

// Turns stored verses into what a page prints: blocks of text with verse
// numbers, headings, footnote markers and red-letter spans in place. Pure
// data in, pure data out; src/components/passage renders the result.
//
// The rules for breaks are those of ./types.ts: a verse starts a new block if
// it is the first of its chapter, has headings, or has a paragraph break at
// offset 0; it starts a new line if it has a line break at offset 0; otherwise
// it runs on from the verse before. A paragraph break inside a verse splits
// its text across two blocks.

// A footnote, numbered in the order its marker appears in the passage.
export type Note = {
  // Position in the passage's list of notes, from 0.
  index: number;
  // What the marker prints: a, b, ... z, aa, ab, ...
  marker: string;
  text: string;
  // The verse the note belongs to; a note in a heading belongs to the verse
  // the heading is attached to.
  verseId: number;
};

export type Inline =
  | { type: "text"; text: string; wordsOfJesus: boolean }
  | { type: "note"; note: Note };

// A verse's text, or the part of it that falls in one block.
export type VersePart = {
  verseId: number;
  // The verse number, on the part that opens the verse.
  number?: number;
  // How the part joins what comes before it in the block: "line" starts a
  // new line, "inline" runs on after a space. The first part of a block has
  // neither.
  join?: "line" | "inline";
  inlines: Inline[];
};

export type Block =
  // Printed where the chapter changes, in a passage of more than one chapter.
  | { type: "chapter"; book: number; chapter: number; label: string }
  | { type: "heading"; kind: Heading["kind"]; verseId: number; inlines: Inline[] }
  | { type: "paragraph"; parts: VersePart[] }
  // Between two ranges of a passage, such as John 3:16-18 and 3:22.
  | { type: "gap" };

export type PassageLayout = { blocks: Block[]; notes: Note[] };

// a, b, ... z, aa, ab, ...: letters, so that a marker is not mistaken for a
// verse number.
export function noteMarker(index: number): string {
  let marker = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    marker = String.fromCharCode(97 + ((n - 1) % 26)) + marker;
  }
  return marker;
}

// Cuts `text` into runs at every footnote, red-letter boundary and paragraph
// break, and returns one list of inlines per paragraph.
function inlinePieces(
  text: string,
  footnotes: readonly Footnote[],
  spans: readonly Span[],
  cuts: readonly number[],
  verseId: number,
  notes: Note[],
): Inline[][] {
  const clamp = (offset: number) => Math.min(Math.max(offset, 0), text.length);
  const stops = new Set([0, text.length]);
  for (const footnote of footnotes) stops.add(clamp(footnote.offset));
  for (const span of spans) stops.add(clamp(span.start)).add(clamp(span.end));
  for (const cut of cuts) stops.add(clamp(cut));
  const ordered = [...stops].sort((a, b) => a - b);

  const pieces: Inline[][] = [[]];
  ordered.forEach((stop, i) => {
    if (stop > 0 && cuts.includes(stop)) {
      // The break follows a "\n", which the block boundary now stands for.
      const piece = pieces.at(-1)!;
      const last = piece.at(-1);
      if (last?.type === "text" && last.text.endsWith("\n")) {
        last.text = last.text.slice(0, -1);
        if (!last.text) piece.pop();
      }
      pieces.push([]);
    }
    const piece = pieces.at(-1)!;
    for (const footnote of footnotes) {
      if (clamp(footnote.offset) !== stop) continue;
      const note: Note = {
        index: notes.length,
        marker: noteMarker(notes.length),
        text: footnote.text,
        verseId,
      };
      notes.push(note);
      piece.push({ type: "note", note });
    }
    const next = ordered[i + 1];
    if (next === undefined) return;
    piece.push({
      type: "text",
      text: text.slice(stop, next),
      wordsOfJesus: spans.some((span) => span.start <= stop && next <= span.end),
    });
  });
  return pieces;
}

function headingBlock(heading: Heading, verseId: number, notes: Note[]): Block {
  const [inlines] = inlinePieces(heading.text, heading.footnotes ?? [], [], [], verseId, notes);
  return { type: "heading", kind: heading.kind, verseId, inlines };
}

export type LayoutOptions = {
  // Print a chapter block where the chapter changes. By default, only when
  // the passage has verses from more than one chapter.
  chapters?: boolean;
  // Append the passage's notes to this list and number them after the ones
  // already in it, so several layouts can share one list of footnotes.
  notes?: Note[];
};

const chapterOf = (verseId: number) => Math.floor(verseId / 1000);

// Lays out a passage: one list of verses per range, in reading order. A verse
// a translation leaves out is simply absent from its list.
export function layoutPassage(
  ranges: readonly (readonly VerseRecord[])[],
  options: LayoutOptions = {},
): PassageLayout {
  const notes = options.notes ?? [];
  const chapters =
    options.chapters ??
    new Set(ranges.flatMap((verses) => verses.map((verse) => chapterOf(verse.verseId))))
      .size > 1;

  const blocks: Block[] = [];
  // The paragraph the next verse may run on from.
  let open: VersePart[] | undefined;
  let chapter: number | undefined;

  for (const verses of ranges) {
    if (verses.length === 0) continue;
    if (blocks.length > 0) blocks.push({ type: "gap" });
    open = undefined;

    for (const verse of verses) {
      const ref = parseVerseId(verse.verseId);
      if (!ref) throw new RangeError(`Not a verse id: ${verse.verseId}`);

      if (chapterOf(verse.verseId) !== chapter) {
        chapter = chapterOf(verse.verseId);
        if (chapters) {
          blocks.push({
            type: "chapter",
            book: ref.book,
            chapter: ref.chapter,
            label: chapterLabel(ref.book, ref.chapter),
          });
        }
        open = undefined;
      }

      for (const heading of verse.headings) {
        if (heading.kind === "subscription") continue;
        blocks.push(headingBlock(heading, verse.verseId, notes));
        open = undefined;
      }

      const starts = (kind: "paragraph" | "line") =>
        verse.breaks.some((item) => item.offset === 0 && item.kind === kind);
      if (ref.verse === 1 || starts("paragraph")) open = undefined;

      const cuts = verse.breaks
        .filter((item) => item.kind === "paragraph" && item.offset > 0)
        .map((item) => item.offset);
      const pieces = inlinePieces(
        verse.text,
        verse.footnotes,
        verse.wordsOfJesus,
        cuts,
        verse.verseId,
        notes,
      );
      pieces.forEach((inlines, i) => {
        const part: VersePart = { verseId: verse.verseId, inlines };
        if (i === 0) part.number = ref.verse;
        if (i === 0 && open) {
          part.join = starts("line") ? "line" : "inline";
          open.push(part);
        } else {
          open = [part];
          blocks.push({ type: "paragraph", parts: open });
        }
      });

      for (const heading of verse.headings) {
        if (heading.kind !== "subscription") continue;
        blocks.push(headingBlock(heading, verse.verseId, notes));
        open = undefined;
      }
    }
  }
  return { blocks, notes };
}

// A paragraph as the lines it prints on: one for prose, one per line of
// poetry. A verse that runs over several lines has a part on each; its number
// stays on the first.
export function paragraphLines(parts: readonly VersePart[]): VersePart[][] {
  const lines: VersePart[][] = [[]];
  for (const part of parts) {
    if (part.join === "line") lines.push([]);
    let current: VersePart = { verseId: part.verseId, inlines: [] };
    if (part.number !== undefined) current.number = part.number;
    if (part.join === "inline") {
      // The space between two verses belongs to neither.
      lines.at(-1)!.push({ verseId: part.verseId, join: "inline", inlines: [] });
    }
    lines.at(-1)!.push(current);

    for (const inline of part.inlines) {
      if (inline.type === "note") {
        current.inlines.push(inline);
        continue;
      }
      inline.text.split("\n").forEach((text, i) => {
        if (i > 0) {
          current = { verseId: part.verseId, inlines: [] };
          lines.push([current]);
        }
        if (text) current.inlines.push({ ...inline, text });
      });
    }
  }
  return lines.filter((line) => line.length > 0);
}

// One row of the parallel view.
export type ParallelRow =
  | { type: "chapter"; book: number; chapter: number; label: string }
  | { type: "gap" }
  | {
      type: "verse";
      verseId: number;
      number: number;
      // One cell per translation, in the order given; null where the
      // translation does not have the verse.
      cells: (Block[] | null)[];
    };

export type ParallelLayout = {
  rows: ParallelRow[];
  // Each translation's footnotes, numbered separately.
  notes: Note[][];
};

// Lays the same passage out for several translations with the verses aligned:
// a row for every verse any of them has. `translations[t][r]` holds the
// verses translation t has in range r.
export function layoutParallel(
  translations: readonly (readonly (readonly VerseRecord[])[])[],
): ParallelLayout {
  const notes: Note[][] = translations.map(() => []);
  const rangeCount = Math.max(0, ...translations.map((ranges) => ranges.length));

  const perRange = Array.from({ length: rangeCount }, (_, r) => {
    const byId = translations.map(
      (ranges) => new Map((ranges[r] ?? []).map((verse) => [verse.verseId, verse])),
    );
    const ids = [...new Set(byId.flatMap((verses) => [...verses.keys()]))];
    return { byId, ids: ids.sort((a, b) => a - b) };
  });
  const chapters =
    new Set(perRange.flatMap(({ ids }) => ids.map(chapterOf))).size > 1;

  const rows: ParallelRow[] = [];
  let chapter: number | undefined;
  for (const { byId, ids } of perRange) {
    if (ids.length === 0) continue;
    if (rows.length > 0) rows.push({ type: "gap" });

    for (const verseId of ids) {
      const ref = parseVerseId(verseId);
      if (!ref) throw new RangeError(`Not a verse id: ${verseId}`);
      if (chapterOf(verseId) !== chapter) {
        chapter = chapterOf(verseId);
        if (chapters) {
          rows.push({
            type: "chapter",
            book: ref.book,
            chapter: ref.chapter,
            label: chapterLabel(ref.book, ref.chapter),
          });
        }
      }
      rows.push({
        type: "verse",
        verseId,
        number: ref.verse,
        cells: byId.map((verses, t) => {
          const verse = verses.get(verseId);
          return verse
            ? layoutPassage([[verse]], { chapters: false, notes: notes[t] }).blocks
            : null;
        }),
      });
    }
  }
  return { rows, notes };
}
