import { describe, expect, it } from "vitest";

import { BIBLE_SOURCES } from "./import/sources";
import { isVerseId } from "./verse-id";
import { RENUMBERED, canonicalVerseId } from "./versification";

const ids = BIBLE_SOURCES.map((source) => source.id);

describe("canonicalVerseId", () => {
  it("maps a reference to the same id in every translation", () => {
    for (const id of ids) {
      expect(canonicalVerseId(id, { usfm: "JHN", chapter: 3, verse: 16 })).toBe(43_003_016);
      expect(canonicalVerseId(id, { usfm: "PSA", chapter: 23, verse: 1 })).toBe(19_023_001);
      expect(canonicalVerseId(id, { usfm: "3JN", chapter: 1, verse: 14 })).toBe(64_001_014);
    }
  });

  it("renumbers the WEB's Romans doxology from 14:24-26 to 16:25-27", () => {
    expect(canonicalVerseId("web", { usfm: "ROM", chapter: 14, verse: 23 })).toBe(45_014_023);
    expect(canonicalVerseId("web", { usfm: "ROM", chapter: 14, verse: 24 })).toBe(45_016_025);
    expect(canonicalVerseId("web", { usfm: "ROM", chapter: 14, verse: 25 })).toBe(45_016_026);
    expect(canonicalVerseId("web", { usfm: "ROM", chapter: 14, verse: 26 })).toBe(45_016_027);
    expect(canonicalVerseId("web", { usfm: "ROM", chapter: 16, verse: 24 })).toBe(45_016_024);
  });

  it("applies a translation's renumbering to that translation only", () => {
    // Romans 14 ends at verse 23 in the canonical versification.
    for (const id of ["bsb", "kjv", "unknown"]) {
      expect(() => canonicalVerseId(id, { usfm: "ROM", chapter: 14, verse: 24 })).toThrow(
        RangeError,
      );
      expect(canonicalVerseId(id, { usfm: "ROM", chapter: 16, verse: 25 })).toBe(45_016_025);
    }
  });

  it("accepts 3 John 1:15 and Revelation 12:18, which other traditions number", () => {
    // None of BSB, WEB or KJV has these verses, but a translation that
    // follows the NA28 numbering does, and its rows need a valid id.
    expect(canonicalVerseId("bsb", { usfm: "3JN", chapter: 1, verse: 15 })).toBe(64_001_015);
    expect(canonicalVerseId("bsb", { usfm: "REV", chapter: 12, verse: 18 })).toBe(66_012_018);
    expect(() => canonicalVerseId("bsb", { usfm: "3JN", chapter: 1, verse: 16 })).toThrow(
      RangeError,
    );
  });

  it("rejects verse 0, unknown books and verses past the end of a chapter", () => {
    for (const source of [
      { usfm: "PSA", chapter: 3, verse: 0 },
      { usfm: "TOB", chapter: 1, verse: 1 },
      { usfm: "JHN", chapter: 3, verse: 37 },
      { usfm: "PSA", chapter: 151, verse: 1 },
    ]) {
      expect(() => canonicalVerseId("kjv", source)).toThrow(RangeError);
    }
  });

  it("only renumbers known translations onto canonical, distinct verses", () => {
    for (const [translationId, rules] of Object.entries(RENUMBERED)) {
      expect(ids).toContain(translationId);
      const targets = rules.map((rule) => canonicalVerseId(translationId, rule.from));
      expect(targets.every(isVerseId)).toBe(true);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});
