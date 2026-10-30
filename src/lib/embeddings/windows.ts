import { createHash } from "node:crypto";

import type { VerseRange } from "@/lib/bible/verse-id";

// The verse windows passages are embedded in. A single verse says too little
// to place by meaning, and a chapter says too many things at once, so a window
// is four verses, and starts every second verse: each verse is in two windows,
// so a thought that runs across a window's edge is whole in the next one.
//
// A window never leaves its chapter, so it never crosses a book either. The
// last window of a chapter is cut short at the chapter's end, and a chapter
// shorter than a window is one window. A window is made of the verses this
// translation has: where it leaves one out, the window simply reads across the
// gap. Its first and last verses are the passage a match opens on.

export const WINDOW_VERSES = 4;
export const WINDOW_STRIDE = 2;

export type PassageWindow = VerseRange & { text: string };

const chapterOf = (verseId: number) => Math.floor(verseId / 1000);

// Line breaks in a verse are poetry and paragraphs, not meaning.
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// The windows of a translation's verses, which must be in reading order.
export function buildWindows(
  verses: readonly { verseId: number; text: string }[],
  { size = WINDOW_VERSES, stride = WINDOW_STRIDE } = {},
): PassageWindow[] {
  const windows: PassageWindow[] = [];
  let first = 0;
  while (first < verses.length) {
    const chapter = chapterOf(verses[first].verseId);
    let next = first;
    while (next < verses.length && chapterOf(verses[next].verseId) === chapter) next++;
    for (let at = first; at < next; at += stride) {
      const run = verses.slice(at, Math.min(at + size, next));
      windows.push({
        start: run[0].verseId,
        end: run.at(-1)!.verseId,
        text: run.map((verse) => oneLine(verse.text)).join(" "),
      });
      if (at + size >= next) break;
    }
    first = next;
  }
  return windows;
}

// Stored with a vector, to tell when the text under it has changed.
export const textHash = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);
