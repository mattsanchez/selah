import { describe, expect, it } from "vitest";

import { BOOKS } from "@/lib/bible/books";

import { bookByOsis, bookByTyndale, parseOsisRange, parseTyndaleRange } from "./refs";

describe("bookByOsis", () => {
  it("knows the 66 books by their OSIS codes", () => {
    expect(bookByOsis("Gen")?.usfm).toBe("GEN");
    expect(bookByOsis("Ps")?.usfm).toBe("PSA");
    expect(bookByOsis("Song")?.usfm).toBe("SNG");
    expect(bookByOsis("1Thess")?.usfm).toBe("1TH");
    expect(bookByOsis("Phlm")?.usfm).toBe("PHM");
    expect(bookByOsis("3John")?.usfm).toBe("3JN");
    expect(bookByOsis("Rev")).toBe(BOOKS[65]);
    expect(bookByOsis("Tob")).toBeUndefined();
    expect(bookByOsis("gen")).toBeUndefined();
  });
});

describe("bookByTyndale", () => {
  it("reads Tyndale's own codes, with the number either way", () => {
    expect(bookByTyndale("Pr")?.usfm).toBe("PRO");
    expect(bookByTyndale("Jon")?.usfm).toBe("JON");
    expect(bookByTyndale("John")?.usfm).toBe("JHN");
    expect(bookByTyndale("Hagg")?.usfm).toBe("HAG");
    expect(bookByTyndale("1Thes")?.usfm).toBe("1TH");
    expect(bookByTyndale("2Sam")?.usfm).toBe("2SA");
    expect(bookByTyndale("IISam")?.usfm).toBe("2SA");
    expect(bookByTyndale("IJn")?.usfm).toBe("1JN");
    expect(bookByTyndale("IIIJn")?.usfm).toBe("3JN");
    // Not a roman numeral: Isaiah.
    expect(bookByTyndale("Isa")?.usfm).toBe("ISA");
    expect(bookByTyndale("Baptism_ThemeNote_Filament")).toBeUndefined();
  });
});

describe("parseOsisRange", () => {
  it("maps a verse and a range to canonical ids", () => {
    expect(parseOsisRange("John.3.16")).toEqual({ start: 43003016, end: 43003016 });
    expect(parseOsisRange("1John.4.9-1John.4.10")).toEqual({ start: 62004009, end: 62004010 });
    expect(parseOsisRange("Heb.6.20-Heb.7.3")).toEqual({ start: 58006020, end: 58007003 });
  });

  it("reads a chapter as all of its verses", () => {
    expect(parseOsisRange("Ps.23")).toEqual({ start: 19023001, end: 19023006 });
    expect(parseOsisRange("Rom.1-Rom.3")).toEqual({ start: 45001001, end: 45003031 });
  });

  it("refuses what is not in the canon, or not in order", () => {
    expect(parseOsisRange("John.3.99")).toBeUndefined();
    expect(parseOsisRange("John.22.1")).toBeUndefined();
    expect(parseOsisRange("Tob.1.1")).toBeUndefined();
    expect(parseOsisRange("John.3.16-John.3.2")).toBeUndefined();
    expect(parseOsisRange("John.3.16 John.3.18")).toBeUndefined();
    expect(parseOsisRange("John.3.x")).toBeUndefined();
    expect(parseOsisRange("")).toBeUndefined();
  });

  it("knows the two verses the canon adds to the King James numbering", () => {
    expect(parseOsisRange("3John.1.15")).toEqual({ start: 64001015, end: 64001015 });
    expect(parseOsisRange("Rev.12.18")).toEqual({ start: 66012018, end: 66012018 });
  });
});

describe("parseTyndaleRange", () => {
  it("maps a verse, a range in a chapter and a range across chapters", () => {
    expect(parseTyndaleRange("John.3.16")).toEqual({ start: 43003016, end: 43003016 });
    expect(parseTyndaleRange("John.3.16-21")).toEqual({ start: 43003016, end: 43003021 });
    expect(parseTyndaleRange("Gen.1.1-2.3")).toEqual({ start: 1001001, end: 1002003 });
    expect(parseTyndaleRange("IISam.7.1-17")).toEqual({ start: 10007001, end: 10007017 });
  });

  it("refuses what it cannot place", () => {
    // Tyndale's own slip for 1:3-2:3.
    expect(parseTyndaleRange("Gen.1.3-2")).toBeUndefined();
    expect(parseTyndaleRange("John.3.40")).toBeUndefined();
    expect(parseTyndaleRange("John.3.16-40")).toBeUndefined();
    expect(parseTyndaleRange("Baptism_ThemeNote_Filament")).toBeUndefined();
  });

  it("can take an end past the chapter's last verse as its last verse", () => {
    expect(parseTyndaleRange("John.3.16-40", { clamp: true })).toEqual({
      start: 43003016,
      end: 43003036,
    });
    expect(parseTyndaleRange("John.3.40", { clamp: true })).toBeUndefined();
  });
});
