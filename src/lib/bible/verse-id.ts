import { bookByNumber, type Book } from "./books";

// A canonical verse id is the integer BBCCCVVV: book 1-66, chapter, verse.
// John 3:16 is 43003016. Ids are shared by every translation and sort in
// reading order, so a passage is an inclusive [start, end] range of ids.
export type VerseRef = { book: number; chapter: number; verse: number };

export type VerseRange = { start: number; end: number };

function lastVerse(book: Book | undefined, chapter: number): number | undefined {
  return Number.isInteger(chapter) ? book?.verseCounts[chapter - 1] : undefined;
}

// True when the reference names a verse of the canonical versification.
export function isValidRef({ book, chapter, verse }: VerseRef): boolean {
  const last = lastVerse(bookByNumber(book), chapter);
  return last !== undefined && Number.isInteger(verse) && verse >= 1 && verse <= last;
}

export function toVerseId(ref: VerseRef): number {
  if (!isValidRef(ref)) {
    throw new RangeError(
      `No such verse: book ${ref.book}, chapter ${ref.chapter}, verse ${ref.verse}`,
    );
  }
  return ref.book * 1_000_000 + ref.chapter * 1_000 + ref.verse;
}

// Splits an id into its parts; undefined unless it names a canonical verse.
export function parseVerseId(id: number): VerseRef | undefined {
  if (!Number.isInteger(id) || id < 0) return undefined;
  const ref = {
    book: Math.floor(id / 1_000_000),
    chapter: Math.floor(id / 1_000) % 1_000,
    verse: id % 1_000,
  };
  return isValidRef(ref) ? ref : undefined;
}

export function isVerseId(id: number): boolean {
  return parseVerseId(id) !== undefined;
}

// "John 3:16". Throws on an id that is not a canonical verse.
export function formatVerseId(id: number): string {
  const ref = parseVerseId(id);
  if (!ref) throw new RangeError(`Not a verse id: ${id}`);
  return `${bookByNumber(ref.book)!.name} ${ref.chapter}:${ref.verse}`;
}

// Every verse id of a chapter, as an inclusive range.
export function chapterRange(book: number, chapter: number): VerseRange {
  const last = lastVerse(bookByNumber(book), chapter);
  if (last === undefined) {
    throw new RangeError(`No such chapter: book ${book}, chapter ${chapter}`);
  }
  return {
    start: toVerseId({ book, chapter, verse: 1 }),
    end: toVerseId({ book, chapter, verse: last }),
  };
}

// Every verse id of a book, as an inclusive range.
export function bookRange(book: number): VerseRange {
  const chapters = bookByNumber(book)?.verseCounts.length;
  if (chapters === undefined) throw new RangeError(`No such book: ${book}`);
  return {
    start: chapterRange(book, 1).start,
    end: chapterRange(book, chapters).end,
  };
}
