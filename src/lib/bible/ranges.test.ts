import { describe, expect, it } from "vitest";

import {
  countVerses,
  coversVerse,
  intersectRanges,
  normalizeRanges,
  rangesOverlap,
  removeVerse,
} from "./ranges";

const verse = (id: number) => ({ start: id, end: id });
const range = (start: number, end: number) => ({ start, end });

// John 3 has 36 verses, so John 3:36 and 4:1 are next to each other.
const JOHN_3_36 = 43003036;
const JOHN_4_1 = 43004001;

describe("rangesOverlap and coversVerse", () => {
  it("count the ends of a range as part of it", () => {
    expect(rangesOverlap(range(43003016, 43003018), range(43003018, 43003020))).toBe(true);
    expect(rangesOverlap(range(43003016, 43003018), range(43003019, 43003020))).toBe(false);
    expect(rangesOverlap(range(43003001, 43003036), verse(43003016))).toBe(true);
    expect(coversVerse([range(43003016, 43003018), verse(43003020)], 43003018)).toBe(true);
    expect(coversVerse([range(43003016, 43003018), verse(43003020)], 43003019)).toBe(false);
    expect(coversVerse([], 43003016)).toBe(false);
  });
});

describe("normalizeRanges", () => {
  it("sorts into reading order and joins ranges that overlap", () => {
    expect(
      normalizeRanges([verse(43003020), range(43003016, 43003018), range(43003017, 43003019)]),
    ).toEqual([range(43003016, 43003020)]);
    expect(normalizeRanges([range(43003016, 43003021), verse(43003018)])).toEqual([
      range(43003016, 43003021),
    ]);
  });

  it("joins verses that are next to each other, and keeps apart those that are not", () => {
    expect(normalizeRanges([verse(43003017), verse(43003016)])).toEqual([
      range(43003016, 43003017),
    ]);
    expect(normalizeRanges([verse(43003016), verse(43003018)])).toEqual([
      verse(43003016),
      verse(43003018),
    ]);
  });

  it("knows the last verse of a chapter is next to the first of the following one", () => {
    expect(normalizeRanges([verse(JOHN_4_1), verse(JOHN_3_36)])).toEqual([
      range(JOHN_3_36, JOHN_4_1),
    ]);
    // John 21:25 is the last verse of John; Acts 1:1 follows it.
    expect(normalizeRanges([verse(43021025), verse(44001001)])).toEqual([
      range(43021025, 44001001),
    ]);
    expect(normalizeRanges([verse(43003035), verse(JOHN_4_1)])).toHaveLength(2);
  });

  it("leaves what it is given untouched", () => {
    const given = [range(43003016, 43003018), verse(43003019)];
    normalizeRanges(given);
    expect(given).toEqual([range(43003016, 43003018), verse(43003019)]);
    expect(normalizeRanges([])).toEqual([]);
  });
});

describe("intersectRanges", () => {
  it("keeps the verses in both lists", () => {
    expect(intersectRanges([range(43003016, 43003021)], [range(43003018, 43003030)])).toEqual([
      range(43003018, 43003021),
    ]);
    expect(intersectRanges([range(43003016, 43003017)], [range(43003018, 43003030)])).toEqual([]);
    expect(intersectRanges([], [range(43003018, 43003030)])).toEqual([]);
  });

  it("cuts a range that spans a gap in the other list", () => {
    // A selection stretched over "John 3:16-18; 4:1-3" selects only what shows.
    const passage = [range(43003016, 43003018), range(43004001, 43004003)];
    expect(intersectRanges([range(43003017, 43004002)], passage)).toEqual([
      range(43003017, 43003018),
      range(43004001, 43004002),
    ]);
  });
});

describe("removeVerse", () => {
  it("shortens a range from either end and splits it in the middle", () => {
    const run = [range(43003016, 43003019)];
    expect(removeVerse(run, 43003016)).toEqual([range(43003017, 43003019)]);
    expect(removeVerse(run, 43003019)).toEqual([range(43003016, 43003018)]);
    expect(removeVerse(run, 43003017)).toEqual([verse(43003016), range(43003018, 43003019)]);
  });

  it("splits across a chapter boundary on real verses", () => {
    expect(removeVerse([range(43003035, 43004002)], JOHN_4_1)).toEqual([
      range(43003035, JOHN_3_36),
      verse(43004002),
    ]);
    expect(removeVerse([range(43003035, 43004002)], JOHN_3_36)).toEqual([
      verse(43003035),
      range(JOHN_4_1, 43004002),
    ]);
  });

  it("removes a verse that is a range of its own, and ignores one not there", () => {
    expect(removeVerse([verse(43003016), verse(43003018)], 43003018)).toEqual([verse(43003016)]);
    expect(removeVerse([verse(43003016)], 43003016)).toEqual([]);
    expect(removeVerse([verse(43003016)], 43003020)).toEqual([verse(43003016)]);
  });
});

describe("countVerses", () => {
  it("counts the verses of a passage, across chapters and books", () => {
    expect(countVerses([{ start: 43003016, end: 43003021 }])).toBe(6);
    expect(countVerses([{ start: 45008001, end: 45008039 }])).toBe(39);
    // John 21:24 to Acts 1:2: John 21 has 25 verses.
    expect(countVerses([{ start: 43021024, end: 44001002 }])).toBe(4);
    expect(countVerses([{ start: 19119001, end: 19119176 }, { start: 19023001, end: 19023006 }])).toBe(182);
    expect(countVerses([])).toBe(0);
  });
});
