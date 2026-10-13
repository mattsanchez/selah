import { describe, expect, it } from "vitest";

import { BOOKS, bookByNumber, bookByUsfm } from "./books";
import {
  bookRange,
  chapterRange,
  formatVerseId,
  isVerseId,
  nextVerseId,
  parseVerseId,
  previousVerseId,
  toVerseId,
} from "./verse-id";

describe("books", () => {
  it("lists the 66 books in canonical order", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.map((book) => book.number)).toEqual(
      Array.from({ length: 66 }, (_, i) => i + 1),
    );
    expect(new Set(BOOKS.map((book) => book.usfm)).size).toBe(66);
  });

  it("finds books by number and by USFM code", () => {
    expect(bookByNumber(43)?.name).toBe("John");
    expect(bookByUsfm("psa")?.number).toBe(19);
    expect(bookByNumber(0)).toBeUndefined();
    expect(bookByNumber(67)).toBeUndefined();
    expect(bookByNumber(1.5)).toBeUndefined();
    expect(bookByUsfm("TOB")).toBeUndefined();
  });

  it("has the chapter and verse counts of the canonical versification", () => {
    const chapters = BOOKS.reduce((n, book) => n + book.verseCounts.length, 0);
    const verses = BOOKS.flatMap((book) => book.verseCounts).reduce((a, b) => a + b);
    expect(chapters).toBe(1189);
    // The KJV's 31,102 verses plus 3 John 1:15 and Revelation 12:18.
    expect(verses).toBe(31_104);
    expect(bookByUsfm("PSA")?.verseCounts).toHaveLength(150);
    expect(bookByUsfm("PSA")?.verseCounts[118]).toBe(176);
  });
});

describe("verse ids", () => {
  it("encodes a reference as BBCCCVVV", () => {
    expect(toVerseId({ book: 1, chapter: 1, verse: 1 })).toBe(1_001_001);
    expect(toVerseId({ book: 43, chapter: 3, verse: 16 })).toBe(43_003_016);
    expect(toVerseId({ book: 19, chapter: 119, verse: 176 })).toBe(19_119_176);
    expect(toVerseId({ book: 66, chapter: 22, verse: 21 })).toBe(66_022_021);
  });

  it("round-trips every verse of the canon in reading order", () => {
    let previous = 0;
    let count = 0;
    for (const book of BOOKS) {
      book.verseCounts.forEach((last, index) => {
        for (let verse = 1; verse <= last; verse++) {
          const ref = { book: book.number, chapter: index + 1, verse };
          const id = toVerseId(ref);
          expect(id).toBeGreaterThan(previous);
          expect(parseVerseId(id)).toEqual(ref);
          previous = id;
          count++;
        }
      });
    }
    expect(count).toBe(31_104);
  });

  it("rejects references outside the canon", () => {
    for (const ref of [
      { book: 0, chapter: 1, verse: 1 },
      { book: 67, chapter: 1, verse: 1 },
      { book: 43, chapter: 22, verse: 1 },
      { book: 43, chapter: 0, verse: 1 },
      { book: 43, chapter: 3, verse: 37 },
      { book: 43, chapter: 3, verse: 1.5 },
    ]) {
      expect(() => toVerseId(ref)).toThrow(RangeError);
    }
  });

  it("has no verse 0: a psalm superscription is not a verse", () => {
    expect(() => toVerseId({ book: 19, chapter: 3, verse: 0 })).toThrow(RangeError);
    expect(isVerseId(19_003_000)).toBe(false);
    expect(chapterRange(19, 3)).toEqual({ start: 19_003_001, end: 19_003_008 });
  });

  it("parses only ids that name a verse", () => {
    expect(parseVerseId(45_008_028)).toEqual({ book: 45, chapter: 8, verse: 28 });
    for (const id of [0, -43_003_016, 43_003_016.5, 43_003_037, 43_022_001, 67_001_001, NaN]) {
      expect(parseVerseId(id)).toBeUndefined();
      expect(isVerseId(id)).toBe(false);
    }
  });

  it("formats an id as a reference", () => {
    expect(formatVerseId(43_003_016)).toBe("John 3:16");
    expect(formatVerseId(19_023_001)).toBe("Psalms 23:1");
    expect(formatVerseId(64_001_015)).toBe("3 John 1:15");
    expect(() => formatVerseId(43_003_099)).toThrow(RangeError);
  });

  it("gives chapter and book ranges", () => {
    expect(chapterRange(43, 3)).toEqual({ start: 43_003_001, end: 43_003_036 });
    expect(bookRange(45)).toEqual({ start: 45_001_001, end: 45_016_027 });
    expect(bookRange(64)).toEqual({ start: 64_001_001, end: 64_001_015 });
    expect(() => chapterRange(43, 22)).toThrow(RangeError);
    expect(() => bookRange(67)).toThrow(RangeError);
  });

  it("steps to the next and the previous verse across chapters and books", () => {
    expect(nextVerseId(43_003_016)).toBe(43_003_017);
    expect(nextVerseId(43_003_036)).toBe(43_004_001);
    expect(nextVerseId(43_021_025)).toBe(44_001_001);
    expect(nextVerseId(66_022_021)).toBeUndefined();
    expect(previousVerseId(43_003_017)).toBe(43_003_016);
    expect(previousVerseId(43_004_001)).toBe(43_003_036);
    expect(previousVerseId(44_001_001)).toBe(43_021_025);
    expect(previousVerseId(1_001_001)).toBeUndefined();
    expect(() => nextVerseId(43_003_099)).toThrow(RangeError);
    expect(() => previousVerseId(0)).toThrow(RangeError);
  });

  it("walks every verse of a book forwards and back", () => {
    const { start, end } = bookRange(43);
    let count = 1;
    for (let id = start; id !== end; id = nextVerseId(id)!) {
      expect(previousVerseId(nextVerseId(id)!)).toBe(id);
      count++;
    }
    expect(count).toBe(879);
  });
});
