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
      expect(file.formattingSha256).toBe(source.formatting?.contentSha256);
    }
  });

  it("round-trips through its file format", async () => {
    for (const source of BIBLE_SOURCES) {
      expect(
        serializeFixture(
          source.id,
          source.contentSha256,
          records[source.id],
          source.formatting?.contentSha256,
        ),
      ).toBe(await readFile(fixtureUrl(source.id), "utf8"));
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
        for (const { offset, kind } of verse.breaks) {
          // A line start is only ever the start of the verse; a paragraph
          // inside a verse begins right after one of its line breaks.
          if (kind === "line" || offset === 0) expect(offset).toBe(0);
          else expect(verse.text[offset - 1]).toBe("\n");
        }
        expect(verse.breaks.filter((b) => b.offset === 0).length).toBeLessThanOrEqual(1);
        let end = -1;
        for (const span of verse.wordsOfJesus) {
          expect(span.start).toBeGreaterThan(end);
          expect(span.end).toBeGreaterThan(span.start);
          expect(span.end).toBeLessThanOrEqual(verse.text.length);
          expect(verse.text.slice(span.start, span.end)).not.toMatch(/^\s|\s$/);
          end = span.end;
        }
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

  const paragraphs = (id: string, book: number) =>
    inBook(id, book).flatMap((v) => v.breaks.filter((b) => b.kind === "paragraph"));
  const redLetter = (id: string, book: number) =>
    inBook(id, book).filter((v) => v.wordsOfJesus.length > 0);
  const words = (id: string, verseId: number) => {
    const verse = fixture[id].get(verseId)!;
    return verse.wordsOfJesus.map(({ start, end }) => verse.text.slice(start, end));
  };

  it("has the BSB's paragraphs, between verses and inside them", () => {
    // John 3: Nicodemus comes (1-2), then each turn of the conversation.
    const starts = [1, 2, 3, 4, 5, 6].map(
      (verse) => fixture.bsb.get(43_003_000 + verse)!.breaks,
    );
    expect(starts).toEqual([
      [],
      [],
      [{ offset: 0, kind: "paragraph" }],
      [{ offset: 0, kind: "paragraph" }],
      [{ offset: 0, kind: "paragraph" }],
      [],
    ]);

    const verse = fixture.bsb.get(43_001_038)!;
    expect(verse.breaks).toEqual([
      { offset: 0, kind: "paragraph" },
      { offset: 67, kind: "paragraph" },
    ]);
    expect(verse.text.slice(0, 66)).toMatch(/He asked\.$/);
    expect(verse.text.slice(67)).toMatch(/^They said to Him,/);

    expect(paragraphs("bsb", 43)).toHaveLength(496);
    expect(paragraphs("bsb", 45)).toHaveLength(189);
  });

  it("has stanzas and line starts in the Psalms", () => {
    // BSB Psalm 2: stanzas at verses 4, 7 and 10; other verses start a line.
    const kinds = Array.from({ length: 12 }, (_, i) =>
      fixture.bsb
        .get(19_002_001 + i)!
        .breaks.filter((b) => b.offset === 0)
        .map((b) => b.kind)
        .join(),
    );
    expect(kinds).toEqual([
      "", "line", "line", "paragraph", "line", "line",
      "paragraph", "line", "line", "paragraph", "line", "line",
    ]);
    // The KJV sets each verse of a psalm as one line.
    expect(fixture.kjv.get(19_023_002)?.breaks).toEqual([{ offset: 0, kind: "line" }]);
    expect(paragraphs("web", 19).length).toBeGreaterThan(0);
  });

  it("has the KJV's paragraphs where it prints a pilcrow", () => {
    expect(fixture.kjv.get(43_003_016)?.breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
    expect(fixture.kjv.get(43_003_017)?.breaks).toEqual([]);
    expect(paragraphs("kjv", 43)).toHaveLength(70);
    // The KJV's paragraph marks stop at Acts 20.
    expect(paragraphs("kjv", 45)).toEqual([]);
  });

  it("has the WEB's prose paragraphs, from its publisher's USFM", () => {
    // John 3: Nicodemus comes (1-2), then each turn of the conversation.
    const starts = [1, 2, 3, 4, 5, 6].map(
      (verse) => fixture.web.get(43_003_000 + verse)!.breaks,
    );
    expect(starts).toEqual([
      [{ offset: 0, kind: "paragraph" }],
      [],
      [{ offset: 0, kind: "paragraph" }],
      [{ offset: 0, kind: "paragraph" }],
      [{ offset: 0, kind: "paragraph" }],
      [],
    ]);
    expect(fixture.web.get(45_001_008)?.breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
    expect(paragraphs("web", 43)).toHaveLength(370);
    expect(paragraphs("web", 45)).toHaveLength(97);
  });

  it("starts the WEB's paragraphs inside a verse after a line break", () => {
    // John 1:21: each change of speaker starts a paragraph.
    expect(fixture.web.get(43_001_021)).toMatchObject({
      text: "They asked him, “What then? Are you Elijah?”\nHe said, “I am not.”\n“Are you the prophet?”\nHe answered, “No.”",
      breaks: [
        { offset: 0, kind: "paragraph" },
        { offset: 45, kind: "paragraph" },
        { offset: 66, kind: "paragraph" },
        { offset: 89, kind: "paragraph" },
      ],
    });
    // John 1:39: the red-letter span and the footnote are where they were.
    const verse = fixture.web.get(43_001_039)!;
    expect(verse.text.slice(0, 44)).toBe("He said to them, “Come and see.”\nThey came a");
    expect(words("web", 43_001_039)).toEqual(["“Come and see.”"]);
    expect(verse.footnotes.map((note) => note.offset)).toEqual([verse.text.length]);

    const inside = (book: number) =>
      inBook("web", book).flatMap((v) => v.breaks.filter((item) => item.offset > 0));
    expect(inside(43)).toHaveLength(52);
    expect(inside(45)).toHaveLength(1);
  });

  it("marks the words of Jesus in all three translations", () => {
    // The BSB's come from its publisher's USFM. John 6:42 is left unmarked:
    // the two files punctuate the end of the quotation differently.
    expect(redLetter("bsb", 43)).toHaveLength(430);
    expect(redLetter("web", 43)).toHaveLength(436);
    expect(redLetter("kjv", 43)).toHaveLength(419);
    for (const { id } of BIBLE_SOURCES) {
      expect(redLetter(id, 19)).toEqual([]);
      expect(redLetter(id, 45)).toEqual([]);
    }
    expect(words("bsb", 43_006_042)).toEqual([]);
    // Three verses where the USFM ends on a bracketed closing quotation mark
    // the stored text does not have.
    expect(words("bsb", 43_013_038)).toEqual([
      "“Will you lay down your life for Me?”",
      "“Truly, truly, I tell you, before the rooster crows, you will deny Me three times.",
    ]);
    for (const verse of [14_031, 15_027]) {
      expect(words("bsb", 43_000_000 + verse)).toEqual([fixture.bsb.get(43_000_000 + verse)!.text]);
    }
  });

  it("marks part of a verse, a run of whole verses, and two spans in one verse", () => {
    expect(words("web", 43_003_003)).toEqual([
      "“Most certainly I tell you, unless one is born anew, he can’t see God’s Kingdom.”",
    ]);
    expect(words("kjv", 43_003_003)).toEqual([
      "Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.",
    ]);
    // The note in BSB John 3:3 falls before the closing quotation mark.
    expect(words("bsb", 43_003_003)).toEqual([
      "“Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.”",
    ]);
    expect(words("web", 43_003_002)).toEqual([]);

    // John 3:10-12: the speech opens mid-verse and runs through whole verses.
    expect(words("bsb", 43_003_010)).toEqual([
      "“You are Israel’s teacher,”",
      "“and you do not understand these things?",
    ]);
    for (const id of ["bsb", "web", "kjv"]) {
      if (id !== "bsb") {
        expect(fixture[id].get(43_003_010)!.wordsOfJesus[0].start).toBeGreaterThan(0);
      }
      for (const verseId of [43_003_011, 43_003_012]) {
        const verse = fixture[id].get(verseId)!;
        expect(verse.wordsOfJesus).toEqual([{ start: 0, end: verse.text.length }]);
      }
    }

    expect(words("web", 43_021_015)).toEqual([
      "“Simon, son of Jonah, do you love me more than these?”",
      "“Feed my lambs.”",
    ]);
    expect(words("bsb", 43_021_015)).toEqual([
      "“Simon son of John, do you love Me more than these?”",
      "“Feed My lambs.”",
    ]);
    expect(words("kjv", 43_021_015)).toEqual([
      "Simon, son of Jonas, lovest thou me more than these?",
      "Feed my lambs.",
    ]);
  });
});
