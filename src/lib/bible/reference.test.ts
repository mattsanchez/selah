import { describe, expect, it } from "vitest";

import { bookKey, findBook } from "./book-names";
import { BOOKS } from "./books";
import {
  chapterLabel,
  formatReference,
  parseReference,
  referenceSlug,
  type ReferenceErrorCode,
} from "./reference";
import { bookRange, chapterRange, toVerseId, type VerseRange } from "./verse-id";

const id = (book: number, chapter: number, verse: number) =>
  toVerseId({ book, chapter, verse });
const range = (start: number, end: number = start): VerseRange => ({ start, end });

const GEN = 1;
const PSA = 19;
const SNG = 22;
const JHN = 43;
const ROM = 45;
const PHP = 50;
const PHM = 57;
const JN1 = 62;
const JN3 = 64;
const JUD = 65;

function ranges(input: string): VerseRange[] {
  const result = parseReference(input);
  if (!result.ok) throw new Error(`${input}: ${result.error.message}`);
  return result.ranges;
}

function failure(input: string): { code: ReferenceErrorCode; message: string } {
  const result = parseReference(input);
  if (result.ok) throw new Error(`${input}: parsed, but an error was expected`);
  return result.error;
}

describe("book names", () => {
  it("finds every book by its full name and its USFM code", () => {
    for (const book of BOOKS) {
      expect(findBook(book.name).book, book.name).toBe(book);
      expect(findBook(book.name.toUpperCase()).book, book.name).toBe(book);
      expect(findBook(book.usfm).book, book.usfm).toBe(book);
    }
  });

  it.each([
    ["Gen", "Genesis"],
    ["Ex", "Exodus"],
    ["Deut", "Deuteronomy"],
    ["Dt", "Deuteronomy"],
    ["Josh", "Joshua"],
    ["Judg", "Judges"],
    ["1 Sam", "1 Samuel"],
    ["2 Kgs", "2 Kings"],
    ["1 Chr", "1 Chronicles"],
    ["Neh", "Nehemiah"],
    ["Job", "Job"],
    ["Ps", "Psalms"],
    ["Psa", "Psalms"],
    ["Psalm", "Psalms"],
    ["Psalms", "Psalms"],
    ["Prov", "Proverbs"],
    ["Eccl", "Ecclesiastes"],
    ["Song", "Song of Solomon"],
    ["Song of Songs", "Song of Solomon"],
    ["SoS", "Song of Solomon"],
    ["Isa", "Isaiah"],
    ["Jer", "Jeremiah"],
    ["Ezek", "Ezekiel"],
    ["Mt", "Matthew"],
    ["Matt", "Matthew"],
    ["Mk", "Mark"],
    ["Lk", "Luke"],
    ["Jn", "John"],
    ["Jhn", "John"],
    ["Rom", "Romans"],
    ["1 Cor", "1 Corinthians"],
    ["2 Co", "2 Corinthians"],
    ["Gal", "Galatians"],
    ["Eph", "Ephesians"],
    ["Phil", "Philippians"],
    ["Php", "Philippians"],
    ["Col", "Colossians"],
    ["1 Thess", "1 Thessalonians"],
    ["2 Tim", "2 Timothy"],
    ["Tit", "Titus"],
    ["Phlm", "Philemon"],
    ["Philem", "Philemon"],
    ["Heb", "Hebrews"],
    ["Jas", "James"],
    ["1 Pet", "1 Peter"],
    ["1 Jn", "1 John"],
    ["3 Jn", "3 John"],
    ["Jude", "Jude"],
    ["Rev", "Revelation"],
    ["Revelations", "Revelation"],
  ])("reads the abbreviation %s as %s", (written, name) => {
    expect(findBook(written).book?.name).toBe(name);
  });

  it("ignores case, spaces and periods", () => {
    for (const written of ["jn", "JN", "Jn.", " j n ", "JOHN", "john."]) {
      expect(findBook(written).book?.name, written).toBe("John");
    }
    expect(bookKey(" 1 Jn. ")).toBe("1jn");
  });

  it.each([
    ["1 John", "1 John"],
    ["1John", "1 John"],
    ["1jn", "1 John"],
    ["I John", "1 John"],
    ["1st John", "1 John"],
    ["First John", "1 John"],
    ["II Kings", "2 Kings"],
    ["2nd Kings", "2 Kings"],
    ["Second Kings", "2 Kings"],
    ["III John", "3 John"],
    ["3rd Jn", "3 John"],
    ["Third John", "3 John"],
    ["II Cor", "2 Corinthians"],
    ["i sam", "1 Samuel"],
    ["ii thess", "2 Thessalonians"],
  ])("reads the numbered book %s as %s", (written, name) => {
    expect(findBook(written).book?.name).toBe(name);
  });

  it("keeps books that start with I apart from the numbered books", () => {
    expect(findBook("Isaiah").book?.name).toBe("Isaiah");
    expect(findBook("Is").book?.name).toBe("Isaiah");
    expect(findBook("Isa").book?.name).toBe("Isaiah");
    expect(findBook("I Sam").book?.name).toBe("1 Samuel");
  });

  it("accepts an unambiguous prefix of a full name", () => {
    expect(findBook("Deuter").book?.name).toBe("Deuteronomy");
    expect(findBook("Revel").book?.name).toBe("Revelation");
    expect(findBook("1 Thessal").book?.name).toBe("1 Thessalonians");
    expect(findBook("Philipp").book?.name).toBe("Philippians");
    expect(findBook("Phile").book?.name).toBe("Philemon");
  });

  it("reports the candidates for an ambiguous name, and none for an unknown one", () => {
    const jo = findBook("Jo");
    expect(jo.book).toBeUndefined();
    expect(jo.book ? [] : jo.candidates.map((book) => book.name)).toEqual([
      "Joshua",
      "Job",
      "Joel",
      "Jonah",
      "John",
    ]);

    for (const written of ["Hezekiah", "x", "", "4 John", "John John"]) {
      const match = findBook(written);
      expect(match.book ? null : match.candidates, written).toEqual([]);
    }
  });
});

describe("parseReference", () => {
  it("reads the three references of the lookup journey", () => {
    expect(ranges("John 3:16-21")).toEqual([range(43003016, 43003021)]);
    expect(ranges("jn3.16")).toEqual([range(43003016)]);
    expect(ranges("Ps 23")).toEqual([range(19023001, 19023006)]);
  });

  it("reads a single verse", () => {
    expect(ranges("John 3:16")).toEqual([range(id(JHN, 3, 16))]);
    expect(ranges("Romans 8:1")).toEqual([range(id(ROM, 8, 1))]);
    expect(ranges("Genesis 1:1")).toEqual([range(id(GEN, 1, 1))]);
  });

  it("reads a verse range within a chapter", () => {
    expect(ranges("John 3:16-21")).toEqual([range(id(JHN, 3, 16), id(JHN, 3, 21))]);
    expect(ranges("Rom 8:28-39")).toEqual([range(id(ROM, 8, 28), id(ROM, 8, 39))]);
    expect(ranges("John 3:16-16")).toEqual([range(id(JHN, 3, 16))]);
  });

  it("reads a range across chapters", () => {
    expect(ranges("John 3:16-4:3")).toEqual([range(id(JHN, 3, 16), id(JHN, 4, 3))]);
    expect(ranges("Ps 22:1-24:10")).toEqual([range(id(PSA, 22, 1), id(PSA, 24, 10))]);
    expect(ranges("John 3-4:10")).toEqual([range(id(JHN, 3, 1), id(JHN, 4, 10))]);
  });

  it("reads whole chapters and chapter ranges", () => {
    expect(ranges("Ps 23")).toEqual([chapterRange(PSA, 23)]);
    expect(ranges("John 3")).toEqual([chapterRange(JHN, 3)]);
    expect(ranges("John 3-5")).toEqual([range(id(JHN, 3, 1), id(JHN, 5, 47))]);
    expect(ranges("Psalm 119")).toEqual([range(19119001, 19119176)]);
  });

  it("reads a whole book", () => {
    expect(ranges("John")).toEqual([bookRange(JHN)]);
    expect(ranges("1 John")).toEqual([bookRange(JN1)]);
    expect(ranges("philemon")).toEqual([range(id(PHM, 1, 1), id(PHM, 1, 25))]);
    expect(ranges("Song of Solomon")).toEqual([bookRange(SNG)]);
  });

  it("accepts . as well as : between chapter and verse", () => {
    expect(ranges("John 3.16")).toEqual(ranges("John 3:16"));
    expect(ranges("John 3.16-21")).toEqual(ranges("John 3:16-21"));
    expect(ranges("John 3.16-4.3")).toEqual(ranges("John 3:16-4:3"));
  });

  it("reads compact forms with no space after the book", () => {
    expect(ranges("jn3.16")).toEqual([range(id(JHN, 3, 16))]);
    expect(ranges("jn3:16-21")).toEqual(ranges("John 3:16-21"));
    expect(ranges("ps23")).toEqual([chapterRange(PSA, 23)]);
    expect(ranges("rom8.28")).toEqual([range(id(ROM, 8, 28))]);
    expect(ranges("1jn4.7")).toEqual([range(id(JN1, 4, 7))]);
    expect(ranges("1jn4")).toEqual([chapterRange(JN1, 4)]);
    expect(ranges("JOHN3")).toEqual([chapterRange(JHN, 3)]);
  });

  it("reads numbered books however the number is written", () => {
    const expected = [range(id(JN1, 4, 7), id(JN1, 4, 12))];
    for (const input of [
      "1 John 4:7-12",
      "1John 4:7-12",
      "1 jn 4:7-12",
      "1jn 4:7-12",
      "1jn4:7-12",
      "1 Jn. 4:7-12",
      "I John 4:7-12",
      "1st John 4:7-12",
      "First John 4:7-12",
      "1-john-4.7-12",
    ]) {
      expect(ranges(input), input).toEqual(expected);
    }
    expect(ranges("3 John 1:14")).toEqual([range(id(JN3, 1, 14))]);
    expect(ranges("II Cor 5:17")).toEqual([range(id(47, 5, 17))]);
  });

  it("reads Psalm, Psalms and Ps alike", () => {
    const expected = [chapterRange(PSA, 23)];
    for (const input of ["Psalm 23", "Psalms 23", "Ps 23", "Ps. 23", "psa 23", "PSALM 23"]) {
      expect(ranges(input), input).toEqual(expected);
    }
    expect(ranges("Psalm 23:1-3")).toEqual(ranges("Ps 23:1-3"));
  });

  it("ignores case and extra spacing", () => {
    const expected = [range(id(JHN, 3, 16), id(JHN, 3, 21))];
    for (const input of [
      "john 3:16-21",
      "JOHN 3:16-21",
      "JoHn 3:16-21",
      "  John   3:16-21  ",
      "John 3 : 16 - 21",
      "John\t3:16 -21",
      "John3:16-21",
      "Jn. 3:16-21",
    ]) {
      expect(ranges(input), input).toEqual(expected);
    }
  });

  it("accepts an en dash, an em dash or a minus sign for the hyphen", () => {
    for (const dash of ["–", "—", "−", "‐"]) {
      expect(ranges(`John 3:16${dash}21`), dash).toEqual(ranges("John 3:16-21"));
    }
    expect(ranges("John 3:16 – 4:3")).toEqual(ranges("John 3:16-4:3"));
  });

  it("reads several references, carrying the book and chapter forward", () => {
    expect(ranges("John 3:16-18, 22; 4:1-3")).toEqual([
      range(id(JHN, 3, 16), id(JHN, 3, 18)),
      range(id(JHN, 3, 22)),
      range(id(JHN, 4, 1), id(JHN, 4, 3)),
    ]);
    expect(ranges("John 3:16,18,20-21")).toEqual([
      range(id(JHN, 3, 16)),
      range(id(JHN, 3, 18)),
      range(id(JHN, 3, 20), id(JHN, 3, 21)),
    ]);
    expect(ranges("John 3:16; Rom 8:1; Ps 23")).toEqual([
      range(id(JHN, 3, 16)),
      range(id(ROM, 8, 1)),
      chapterRange(PSA, 23),
    ]);
    expect(ranges("John 3:16, Romans 8:28")).toEqual([
      range(id(JHN, 3, 16)),
      range(id(ROM, 8, 28)),
    ]);
  });

  it("reads a bare number after a comma as a verse, after a semicolon as a chapter", () => {
    expect(ranges("John 3:16, 4")).toEqual([range(id(JHN, 3, 16)), range(id(JHN, 3, 4))]);
    expect(ranges("John 3:16; 4")).toEqual([range(id(JHN, 3, 16)), chapterRange(JHN, 4)]);
    expect(ranges("John 3:16, 4:1")).toEqual([range(id(JHN, 3, 16)), range(id(JHN, 4, 1))]);
    // After a whole chapter, more chapters.
    expect(ranges("John 3, 5")).toEqual([chapterRange(JHN, 3), chapterRange(JHN, 5)]);
    expect(ranges("Ps 1, 23, 150")).toEqual([
      chapterRange(PSA, 1),
      chapterRange(PSA, 23),
      chapterRange(PSA, 150),
    ]);
    // The chapter carried forward is the one the last range ended in.
    expect(ranges("John 3:16-4:3, 5")).toEqual([
      range(id(JHN, 3, 16), id(JHN, 4, 3)),
      range(id(JHN, 4, 5)),
    ]);
    expect(ranges("John 3:16, 18-4:2")).toEqual([
      range(id(JHN, 3, 16)),
      range(id(JHN, 3, 18), id(JHN, 4, 2)),
    ]);
  });

  it("keeps ranges in the order written, without merging them", () => {
    expect(ranges("John 3:16-18, 17; 1:1")).toEqual([
      range(id(JHN, 3, 16), id(JHN, 3, 18)),
      range(id(JHN, 3, 17)),
      range(id(JHN, 1, 1)),
    ]);
  });

  it("ignores a stray separator at either end", () => {
    expect(ranges("John 3:16;")).toEqual([range(id(JHN, 3, 16))]);
    expect(ranges("John 3:16, ")).toEqual([range(id(JHN, 3, 16))]);
  });

  it("reads a bare number in a one-chapter book as a verse", () => {
    expect(ranges("Jude 5")).toEqual([range(id(JUD, 1, 5))]);
    expect(ranges("Jude 5-7")).toEqual([range(id(JUD, 1, 5), id(JUD, 1, 7))]);
    expect(ranges("Jude 1:5")).toEqual([range(id(JUD, 1, 5))]);
    expect(ranges("Jude 1")).toEqual([bookRange(JUD)]);
    expect(ranges("Jude")).toEqual([bookRange(JUD)]);
    expect(ranges("Jude 1-3")).toEqual([range(id(JUD, 1, 1), id(JUD, 1, 3))]);
    expect(ranges("Philemon 6, 10")).toEqual([range(id(PHM, 1, 6)), range(id(PHM, 1, 10))]);
    expect(ranges("3 John 14")).toEqual([range(id(JN3, 1, 14))]);
    expect(ranges("Obadiah 21")).toEqual([range(id(31, 1, 21))]);
  });

  it("accepts a canonical verse no translation here has", () => {
    // 3 John 1:15 exists in the versification; BSB, WEB and KJV stop at 1:14.
    expect(ranges("3 John 15")).toEqual([range(id(JN3, 1, 15))]);
  });

  describe("errors", () => {
    it("rejects empty input", () => {
      for (const input of ["", "   ", ",", " ; "]) {
        expect(failure(input).code, JSON.stringify(input)).toBe("empty");
      }
    });

    it("rejects a book it does not know, naming what was typed", () => {
      const error = failure("Hezekiah 3:16");
      expect(error.code).toBe("unknown-book");
      expect(error.message).toBe("No book of the Bible is called “hezekiah”.");
      expect(failure("living water").code).toBe("unknown-book");
      expect(failure("4 John 1").message).toBe("No book of the Bible is called “4 john”.");
    });

    it("rejects an ambiguous book, listing the candidates", () => {
      const error = failure("Jo 3:16");
      expect(error.code).toBe("ambiguous-book");
      expect(error.message).toBe("“jo” could be Joshua, Job, Joel, Jonah or John.");
      expect(failure("Ju 1").message).toBe("“ju” could be Judges or Jude.");
    });

    it("rejects numbers with no book before them", () => {
      expect(failure("3:16").code).toBe("missing-book");
      expect(failure("23").code).toBe("missing-book");
    });

    it("rejects a chapter the book does not have", () => {
      const error = failure("John 22");
      expect(error.code).toBe("no-such-chapter");
      expect(error.message).toBe("John has 21 chapters; there is no chapter 22.");
      expect(failure("John 0").code).toBe("no-such-chapter");
      expect(failure("John 22:1").code).toBe("no-such-chapter");
      expect(failure("John 3-22").code).toBe("no-such-chapter");
      expect(failure("Ps 151").message).toBe(
        "Psalms has 150 chapters; there is no chapter 151.",
      );
      expect(failure("Jude 2:1").message).toBe("Jude has 1 chapter; there is no chapter 2.");
    });

    it("rejects a verse the chapter does not have", () => {
      const error = failure("John 3:37");
      expect(error.code).toBe("no-such-verse");
      expect(error.message).toBe("John 3 has 36 verses; there is no verse 37.");
      expect(failure("John 3:0").code).toBe("no-such-verse");
      expect(failure("John 3:30-40").code).toBe("no-such-verse");
      expect(failure("John 3:16, 99").code).toBe("no-such-verse");
      expect(failure("Jude 26").code).toBe("no-such-verse");
      expect(failure("Ps 23:7").message).toBe("Psalm 23 has 6 verses; there is no verse 7.");
      expect(failure("Ps 117:3").message).toBe(
        "Psalm 117 has 2 verses; there is no verse 3.",
      );
    });

    it("rejects a range that ends before it starts", () => {
      expect(failure("John 3:21-16").code).toBe("backwards-range");
      expect(failure("John 4:1-3:16").code).toBe("backwards-range");
      expect(failure("John 5-3").code).toBe("backwards-range");
    });

    it("rejects what is not a chapter and verse", () => {
      for (const input of [
        "John 3:16:2",
        "John 3:",
        "John :16",
        "John 3-",
        "John 3:16-",
        "John 3 16",
        "John 3:16 kjv",
        "John 3:16-18-20",
        "John 1234",
        "John 3:16-Rom 8:1",
        "John #3",
      ]) {
        expect(failure(input).code, input).toBe("syntax");
      }
    });

    it("reports the first error of several references", () => {
      expect(failure("John 3:16; Hezekiah 1").code).toBe("unknown-book");
      expect(failure("John 3:16, 99; Rom 8").code).toBe("no-such-verse");
    });
  });
});

describe("formatReference", () => {
  it.each([
    ["jn3.16", "John 3:16"],
    ["john 3:16-21", "John 3:16-21"],
    ["John 3:16-4:3", "John 3:16-4:3"],
    ["John 3", "John 3"],
    ["John 3-5", "John 3-5"],
    ["John 3:1-36", "John 3"],
    ["John 3:1-4:54", "John 3-4"],
    ["John 1-21", "John"],
    ["jn", "John"],
    ["ps 23", "Psalm 23"],
    ["ps 23:1-3", "Psalm 23:1-3"],
    ["ps 23:1, 4", "Psalm 23:1, 4"],
    ["ps 23-24", "Psalms 23-24"],
    ["ps 23; 27", "Psalms 23; 27"],
    ["ps 23:6-24:2", "Psalms 23:6-24:2"],
    ["psalms", "Psalms"],
    ["1jn4.7", "1 John 4:7"],
    ["song 2:1", "Song of Solomon 2:1"],
    ["Jude 5", "Jude 1:5"],
    ["Jude 1", "Jude"],
    ["Jude 5-7, 9", "Jude 1:5-7, 9"],
    ["John 3:16-18, 22; 4:1-3", "John 3:16-18, 22; 4:1-3"],
    ["John 3:16, 4:1", "John 3:16; 4:1"],
    ["John 3:16; 4", "John 3:16; 4"],
    ["John 3, 5", "John 3; 5"],
    ["John 3; 5:1", "John 3; 5:1"],
    ["John 3:16-4:3, 5", "John 3:16-4:3, 5"],
    ["John 3:16; Rom 8:1; ps 23", "John 3:16; Romans 8:1; Psalm 23"],
    ["John; John 3:16", "John; John 3:16"],
    ["John 3:16; John", "John 3:16; John"],
    ["phil 4:13", "Philippians 4:13"],
  ])("writes %s as %s", (input, expected) => {
    expect(formatReference(ranges(input))).toBe(expected);
  });

  it("splits a range that crosses into the next book", () => {
    expect(formatReference([range(id(JHN, 21, 24), id(44, 1, 2))])).toBe(
      "John 21:24-25; Acts 1:1-2",
    );
    expect(formatReference([range(id(JN3, 1, 14), id(66, 1, 20))])).toBe(
      "3 John 1:14-15; Jude; Revelation 1",
    );
  });

  it("rejects ranges that are not canonical verse ids", () => {
    expect(() => formatReference([range(43003099)])).toThrow(RangeError);
    expect(() => formatReference([range(43003016, 43003001)])).toThrow(RangeError);
  });

  it("is empty for no ranges", () => {
    expect(formatReference([])).toBe("");
  });
});

describe("referenceSlug", () => {
  it.each([
    ["John 3:16-21", "john-3.16-21"],
    ["jn3.16", "john-3.16"],
    ["Ps 23", "psalm-23"],
    ["Psalms 23-24", "psalms-23-24"],
    ["1 John 4:7-12", "1-john-4.7-12"],
    ["Song 2:1", "song-of-solomon-2.1"],
    ["John 3:16-18, 22; 4:1-3", "john-3.16-18,22;4.1-3"],
    ["John 3:16; Rom 8", "john-3.16;romans-8"],
    ["Romans", "romans"],
    ["Rom 8", "romans-8"],
  ])("writes %s as %s", (input, slug) => {
    expect(referenceSlug(ranges(input))).toBe(slug);
    expect(ranges(slug)).toEqual(ranges(input));
  });
});

describe("round trip", () => {
  // A small deterministic generator, so a failure can be reproduced.
  function generator(seed: number) {
    let state = seed;
    return (limit: number) => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state % limit;
    };
  }

  function randomRange(next: (limit: number) => number, bookNumber?: number): VerseRange {
    const book = BOOKS[bookNumber === undefined ? next(BOOKS.length) : bookNumber - 1];
    const pick = () => {
      const chapter = 1 + next(book.verseCounts.length);
      return id(book.number, chapter, 1 + next(book.verseCounts[chapter - 1]));
    };
    switch (next(4)) {
      case 0:
        return bookRange(book.number);
      case 1: {
        const chapters = [1 + next(book.verseCounts.length), 1 + next(book.verseCounts.length)];
        return {
          start: chapterRange(book.number, Math.min(...chapters)).start,
          end: chapterRange(book.number, Math.max(...chapters)).end,
        };
      }
      default: {
        const [start, end] = [pick(), pick()].sort((a, b) => a - b);
        return { start, end };
      }
    }
  }

  it("parses what it formats back to the same ranges", () => {
    const next = generator(20261012);
    for (let i = 0; i < 3000; i++) {
      // Often stay in one book, to exercise the carried book and chapter.
      const book = next(2) === 0 ? 1 + next(BOOKS.length) : undefined;
      const original = Array.from({ length: 1 + next(4) }, () => randomRange(next, book));

      const text = formatReference(original);
      expect(ranges(text), text).toEqual(original);
      const slug = referenceSlug(original);
      expect(ranges(slug), slug).toEqual(original);
      expect(slug, slug).toMatch(/^[a-z0-9.,;-]+$/);
    }
  });

  it("round-trips every chapter of every book", () => {
    for (const book of BOOKS) {
      book.verseCounts.forEach((_, index) => {
        const original = [chapterRange(book.number, index + 1)];
        expect(ranges(formatReference(original))).toEqual(original);
        expect(ranges(referenceSlug(original))).toEqual(original);
      });
    }
  });
});

describe("chapterLabel", () => {
  it("names a chapter, with Psalm in the singular", () => {
    expect(chapterLabel(JHN, 3)).toBe("John 3");
    expect(chapterLabel(PSA, 23)).toBe("Psalm 23");
    expect(chapterLabel(PHP, 4)).toBe("Philippians 4");
    expect(() => chapterLabel(67, 1)).toThrow(RangeError);
  });
});
