import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import type { VerseRecord } from "../types";
import { bookRange, isVerseId, parseVerseId } from "../verse-id";
import { fixtureUrl, readFixture, serializeFixture } from "./fixture";
import { BIBLE_SOURCES } from "./sources";

// These run against the committed fixture, which is real output of the import
// for John, Psalms and Romans, so they also pin down how the import handles
// the versification differences between the three translations.
const fixture: Record<string, Map<number, VerseRecord>> = {};
const records: Record<string, VerseRecord[]> = {};

beforeAll(async () => {
  for (const source of BIBLE_SOURCES) {
    records[source.id] = await readFixture(source.id);
    fixture[source.id] = new Map(records[source.id].map((v) => [v.verseId, v]));
  }
});

const inBook = (id: string, book: number) => {
  const { start, end } = bookRange(book);
  return records[id].filter((v) => v.verseId >= start && v.verseId <= end);
};

describe("Bible fixture", () => {
  it("was built from the pinned sources", async () => {
    for (const source of BIBLE_SOURCES) {
      const file = JSON.parse(await readFile(fixtureUrl(source.id), "utf8"));
      expect(file.translation).toBe(source.id);
      expect(file.sourceSha256).toBe(source.contentSha256);
    }
  });

  it("round-trips through its file format", async () => {
    for (const source of BIBLE_SOURCES) {
      expect(serializeFixture(source.id, source.contentSha256, records[source.id])).toBe(
        await readFile(fixtureUrl(source.id), "utf8"),
      );
    }
  });

  it("holds Psalms, John and Romans under unique canonical ids in reading order", () => {
    for (const { id } of BIBLE_SOURCES) {
      const ids = records[id].map((v) => v.verseId);
      expect(ids.every(isVerseId)).toBe(true);
      expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
      expect(new Set(ids.map((verseId) => parseVerseId(verseId)!.book))).toEqual(
        new Set([19, 43, 45]),
      );
    }
  });

  it("has every verse of the Psalms in each translation", () => {
    for (const { id } of BIBLE_SOURCES) expect(inBook(id, 19)).toHaveLength(2461);
  });

  it("leaves out the verses the BSB omits", () => {
    expect(inBook("kjv", 43)).toHaveLength(879);
    expect(inBook("web", 43)).toHaveLength(879);
    expect(inBook("bsb", 43)).toHaveLength(878);
    expect(fixture.bsb.has(43_005_004)).toBe(false);
    expect(fixture.kjv.get(43_005_004)?.text).toMatch(/^For an angel went down/);

    expect(inBook("kjv", 45)).toHaveLength(433);
    expect(inBook("web", 45)).toHaveLength(433);
    expect(inBook("bsb", 45)).toHaveLength(432);
    expect(fixture.bsb.has(45_016_024)).toBe(false);
  });

  it("keeps a psalm superscription off the verse numbering", () => {
    const expected = {
      bsb: ["A Psalm of David, when he fled from his son Absalom.", /^O LORD, how my foes/],
      web: ["A Psalm by David, when he fled from Absalom his son.", /^LORD, how my adversaries/],
      kjv: ["A Psalm of David, when he fled from Absalom his son.", /^LORD, how are they increased/],
    } as const;
    for (const { id } of BIBLE_SOURCES) {
      const [title, opening] = expected[id as keyof typeof expected];
      const verse = fixture[id].get(19_003_001)!;
      expect(verse.text).toMatch(opening);
      expect(verse.headings.filter((h) => h.kind === "superscription")).toEqual([
        { kind: "superscription", text: title },
      ]);
      // Psalm 3 has 8 verses: the title did not become verse 1 of 9.
      expect(fixture[id].has(19_003_008)).toBe(true);
      expect(fixture[id].has(19_003_009)).toBe(false);

      const titled = inBook(id, 19).filter((v) =>
        v.headings.some((h) => h.kind === "superscription"),
      );
      expect(titled.every((v) => parseVerseId(v.verseId)!.verse === 1)).toBe(true);
      expect(titled.length).toBeGreaterThanOrEqual(115);
    }
  });

  it("carries the BSB's section headings and footnotes", () => {
    expect(fixture.bsb.get(43_001_001)?.headings).toEqual([
      { kind: "section", text: "The Beginning" },
    ]);
    const verse = fixture.bsb.get(43_003_016)!;
    expect(verse.footnotes).toEqual([
      { offset: 56, text: "Or only begotten or unique; also in verse 18" },
    ]);
    expect(verse.text.slice(0, 56)).toMatch(/His one and only$/);
    // A note on a superscription stays with the superscription.
    expect(fixture.bsb.get(19_009_001)?.headings[1].footnotes).toHaveLength(1);
  });

  it("puts the Romans doxology at 16:25-27 in every translation", () => {
    for (const { id } of BIBLE_SOURCES) {
      expect(fixture[id].get(45_016_025)?.text).toMatch(/^Now to (him|Him)/);
      expect(fixture[id].get(45_016_027)?.text).toMatch(/Amen\.$/);
      expect(fixture[id].has(45_014_023)).toBe(true);
      expect(fixture[id].has(45_014_024)).toBe(false);
    }
  });

  it("keeps the KJV's subscription to Romans after its last verse", () => {
    expect(fixture.kjv.get(45_016_027)?.headings).toEqual([
      {
        kind: "subscription",
        text: "Written to the Romans from Corinthus, and sent by Phebe servant of the church at Cenchrea.",
      },
    ]);
  });

  it("heads each stanza of Psalm 119 in the WEB and KJV", () => {
    expect(fixture.web.get(19_119_001)?.headings).toEqual([{ kind: "section", text: "ALEPH" }]);
    expect(fixture.web.get(19_119_009)?.headings).toEqual([{ kind: "section", text: "BETH" }]);
    expect(fixture.web.get(19_119_008)?.text).not.toMatch(/BETH/);
    expect(fixture.kjv.get(19_119_009)?.headings).toEqual([{ kind: "section", text: "ב BETH." }]);
    for (const id of ["web", "kjv"]) {
      const stanzas = inBook(id, 19).filter(
        (v) => parseVerseId(v.verseId)!.chapter === 119 && v.headings.length > 0,
      );
      expect(stanzas).toHaveLength(22);
    }
  });

  it("has clean text and footnotes anchored inside it", () => {
    for (const { id } of BIBLE_SOURCES) {
      for (const verse of records[id]) {
        expect(verse.text).not.toBe("");
        expect(verse.text).not.toMatch(/^\s|\s$| {2}|¶| \n|\n /);
        const noted = [verse, ...verse.headings.filter((h) => h.footnotes)];
        for (const { text, footnotes = [] } of noted) {
          for (const note of footnotes) {
            expect(note.text).not.toBe("");
            expect(note.offset).toBeGreaterThanOrEqual(0);
            expect(note.offset).toBeLessThanOrEqual(text.length);
          }
        }
      }
      expect(records[id].some((v) => v.footnotes.length > 0)).toBe(true);
    }
    expect(fixture.kjv.get(19_003_003)?.footnotes).toEqual([
      { offset: expect.any(Number), text: "for: or, about" },
    ]);
  });
});
