import { inflateSync } from "node:zlib";

import { BOOKS, type Book } from "@/lib/bible/books";
import { bookRange, chapterRange, toVerseId } from "@/lib/bible/verse-id";

import { studyText } from "../html";
import type { CommentaryRecord } from "../types";
import { osisToHtml } from "./osis";

// A reader for the commentary modules of the CrossWire Bible Society's SWORD
// project (module drivers zCom and zCom4, zlib compression, KJV
// versification), which is how CrossWire publishes Matthew Henry,
// Jamieson-Fausset-Brown and Adam Clarke.
//
// A module is three files for each testament:
//
//   ot.bzz   the text, as zlib-compressed blocks
//   ot.bzs   one record per block: where it is in ot.bzz and how long
//   ot.bzv   one record per slot: which block, and where in it the entry is
//
// The slots of a testament are, in order: two for the module and the
// testament, then for each book one slot for the book, and for each chapter
// one slot for the chapter followed by one for each verse. Verses a comment
// covers together all point at the same bytes, which is how a module says
// "John 3:1-21".

// The KJV versification the modules are indexed by: the canonical verse
// counts, less the two verses the canon adds to it (see src/lib/bible/books.ts).
const KJV_LAST_VERSE: Record<string, Record<number, number>> = {
  "3JN": { 1: 14 },
  REV: { 12: 17 },
};

function kjvVerseCounts(book: Book): number[] {
  return book.verseCounts.map(
    (count, i) => KJV_LAST_VERSE[book.usfm]?.[i + 1] ?? count,
  );
}

const FIRST_NEW_TESTAMENT_BOOK = 40;

// One entry of a module, as it is stored: the verses it covers and its OSIS
// markup. `chapter` entries are the text in a chapter's own slot.
export type SwordEntry = {
  kind: "verses" | "chapter";
  book: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  osis: string;
};

function file(files: ReadonlyMap<string, Uint8Array>, name: string): Buffer {
  for (const [path, bytes] of files) {
    if (path.toLowerCase().endsWith(`/${name}`) || path.toLowerCase() === name) {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
  }
  throw new Error(`Not a SWORD commentary module: ${name} is missing`);
}

function readTestament(
  files: ReadonlyMap<string, Uint8Array>,
  name: "ot" | "nt",
  books: readonly Book[],
): SwordEntry[] {
  const blocks = file(files, `${name}.bzs`);
  const slots = file(files, `${name}.bzv`);
  const data = file(files, `${name}.bzz`);

  const slotCount =
    2 + books.reduce((n, book) => n + 1 + kjvVerseCounts(book).reduce((m, v) => m + 1 + v, 0), 0);
  // zCom records a 16-bit length, zCom4 a 32-bit one.
  const recordSize = slots.length / slotCount;
  if (recordSize !== 10 && recordSize !== 12) {
    throw new Error(
      `SWORD module ${name}.bzv has ${slots.length} bytes for ${slotCount} slots; ` +
        "it is not a zCom module in the KJV versification",
    );
  }

  const inflated = new Map<number, Buffer>();
  const block = (index: number): Buffer => {
    let bytes = inflated.get(index);
    if (!bytes) {
      const at = index * 12;
      if (at + 12 > blocks.length) throw new Error(`SWORD module ${name}: no block ${index}`);
      const offset = blocks.readUInt32LE(at);
      const size = blocks.readUInt32LE(at + 4);
      bytes = inflateSync(data.subarray(offset, offset + size));
      if (bytes.length !== blocks.readUInt32LE(at + 8)) {
        throw new Error(`SWORD module ${name}: block ${index} has the wrong length`);
      }
      inflated.set(index, bytes);
    }
    return bytes;
  };
  // A slot's entry, and a key that is the same for slots sharing one entry.
  const read = (slot: number): { key: string; osis: string } | undefined => {
    const at = slot * recordSize;
    const blockIndex = slots.readUInt32LE(at);
    const start = slots.readUInt32LE(at + 4);
    const size = recordSize === 10 ? slots.readUInt16LE(at + 8) : slots.readUInt32LE(at + 8);
    if (size === 0) return undefined;
    return {
      key: `${blockIndex}:${start}:${size}`,
      osis: block(blockIndex).toString("utf8", start, start + size),
    };
  };

  const entries: SwordEntry[] = [];
  let slot = 2;
  for (const book of books) {
    slot++; // The book's own slot holds its title and nothing to import.
    const byKey = new Map<string, SwordEntry>();
    kjvVerseCounts(book).forEach((verses, c) => {
      const chapter = c + 1;
      const intro = read(slot++);
      if (intro) {
        const range = chapterRange(book.number, chapter);
        entries.push({
          kind: "chapter",
          book: book.number,
          chapter,
          verseStart: range.start,
          verseEnd: range.end,
          osis: intro.osis,
        });
      }
      for (let verse = 1; verse <= verses; verse++) {
        const entry = read(slot++);
        if (!entry) continue;
        const id = toVerseId({ book: book.number, chapter, verse });
        const linked = byKey.get(entry.key);
        if (linked) {
          linked.verseEnd = id;
        } else {
          const added: SwordEntry = {
            kind: "verses",
            book: book.number,
            chapter,
            verseStart: id,
            verseEnd: id,
            osis: entry.osis,
          };
          byKey.set(entry.key, added);
          entries.push(added);
        }
      }
    });
  }
  return entries;
}

// Every entry of a module, in canonical order, from the files of its archive.
export function readSwordModule(files: ReadonlyMap<string, Uint8Array>): SwordEntry[] {
  return [
    ...readTestament(files, "ot", BOOKS.slice(0, FIRST_NEW_TESTAMENT_BOOK - 1)),
    ...readTestament(files, "nt", BOOKS.slice(FIRST_NEW_TESTAMENT_BOOK - 1)),
  ];
}

export type SwordOptions = {
  // Where, in the entry that opens a chapter, the comment on its first verse
  // starts. What comes before it is the chapter's introduction, and is stored
  // as an entry on the whole chapter. For a module that keeps both in one entry.
  firstVerseStarts?: RegExp;
  // Leave out the Bible text a comment opens with. Matthew Henry prints the
  // whole passage, in the King James Version, above each section; the reader
  // already has it.
  omitQuotedPassage?: boolean;
};

// The headings an entry opens with, then a paragraph that starts with a
// superscript verse number: the passage as the commentary quotes it.
const QUOTED_PASSAGE = /^((?:<h4>(?:(?!<\/h4>)[\s\S])*<\/h4>)*)<p><sup>\d+<\/sup>(?:(?!<\/p>)[\s\S])*<\/p>/;

const PREVERSE =
  /<div type="x-milestone" subType="x-preverse" sID="([^"]+)"\/>([\s\S]*?)<div type="x-milestone" subType="x-preverse" eID="\1"\/>/;
// A book's introduction is pages long; the titles printed before a verse are
// a line or two.
const BOOK_INTRODUCTION_MIN_CHARS = 1000;

const hasText = (html: string) => studyText(html).length > 0;

// A module's entries as commentary records.
//
// Most entries are stored as they are: the comment on a verse or on a run of
// verses. Three kinds of introduction are stored on the range they introduce,
// so that a comment on a chapter's first verse is not buried under them:
//
// - the text in a chapter's own slot, on the whole chapter;
// - the long text a module prints before a book's first verse (its
//   introduction to the book), on the whole book;
// - with `firstVerseStarts`, what an entry says before its first verse's
//   comment, on the whole chapter.
//
// Entries that end up on the same range are joined in order.
export function normalizeSwordEntries(
  entries: readonly SwordEntry[],
  { firstVerseStarts, omitQuotedPassage = false }: SwordOptions = {},
): CommentaryRecord[] {
  const records = new Map<string, CommentaryRecord>();
  const add = (verseStart: number, verseEnd: number, osis: string) => {
    let html = osisToHtml(osis);
    if (omitQuotedPassage) {
      const without = html.replace(QUOTED_PASSAGE, "$1");
      // Never leave an entry with nothing but its headings.
      if (hasText(without.replace(/<h4>[\s\S]*?<\/h4>/g, ""))) html = without;
    }
    if (!hasText(html)) return;
    const key = `${verseStart}-${verseEnd}`;
    const record = records.get(key);
    if (record) record.html += html;
    else records.set(key, { verseStart, verseEnd, html });
  };

  for (const entry of entries) {
    let { osis } = entry;
    const chapter = chapterRange(entry.book, entry.chapter);
    const opensChapter = entry.kind === "verses" && entry.verseStart === chapter.start;

    if (opensChapter && entry.chapter === 1) {
      const preverse = PREVERSE.exec(osis);
      if (preverse && studyText(osisToHtml(preverse[2])).length >= BOOK_INTRODUCTION_MIN_CHARS) {
        const book = bookRange(entry.book);
        add(book.start, book.end, preverse[2]);
        osis = osis.slice(0, preverse.index) + osis.slice(preverse.index + preverse[0].length);
      }
    }
    if (opensChapter && firstVerseStarts) {
      const at = osis.search(firstVerseStarts);
      if (at > 0) {
        add(chapter.start, chapter.end, osis.slice(0, at));
        osis = osis.slice(at);
      }
    }
    add(entry.verseStart, entry.verseEnd, osis);
  }
  return [...records.values()].sort(
    (a, b) => a.verseStart - b.verseStart || b.verseEnd - a.verseEnd,
  );
}
