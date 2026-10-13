import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { BOOKS } from "@/lib/bible/books";

import { normalizeSwordEntries, readSwordModule, type SwordEntry } from "./sword";

// Builds one testament of a module: every slot empty but those given, each of
// which is [book, chapter, verse (0 for the chapter's own slot), text]. Slots
// given the same text share one entry, as linked verses do.
type Slot = [usfm: string, chapter: number, verse: number, text: string];

function testament(usfms: readonly string[], slots: readonly Slot[], recordSize: 10 | 12) {
  const kjv = (usfm: string, chapter: number) =>
    usfm === "3JN" ? 14 : usfm === "REV" && chapter === 12 ? 17 : undefined;
  const records: Buffer[] = [];
  const texts: Buffer[] = [];
  const at = new Map<string, [number, number]>();
  let length = 0;
  const record = (text?: string) => {
    const buffer = Buffer.alloc(recordSize);
    if (text !== undefined) {
      let place = at.get(text);
      if (!place) {
        const bytes = Buffer.from(text, "utf8");
        place = [length, bytes.length];
        at.set(text, place);
        texts.push(bytes);
        length += bytes.length;
      }
      buffer.writeUInt32LE(0, 0);
      buffer.writeUInt32LE(place[0], 4);
      if (recordSize === 10) buffer.writeUInt16LE(place[1], 8);
      else buffer.writeUInt32LE(place[1], 8);
    }
    records.push(buffer);
  };
  const find = (usfm: string, chapter: number, verse: number) =>
    slots.find((slot) => slot[0] === usfm && slot[1] === chapter && slot[2] === verse)?.[3];

  record();
  record();
  for (const usfm of usfms) {
    const book = BOOKS.find((each) => each.usfm === usfm)!;
    record();
    book.verseCounts.forEach((count, c) => {
      record(find(usfm, c + 1, 0));
      const verses = kjv(usfm, c + 1) ?? count;
      for (let verse = 1; verse <= verses; verse++) record(find(usfm, c + 1, verse));
    });
  }

  const plain = Buffer.concat(texts);
  const packed = deflateSync(plain);
  const block = Buffer.alloc(12);
  block.writeUInt32LE(0, 0);
  block.writeUInt32LE(packed.length, 4);
  block.writeUInt32LE(plain.length, 8);
  return { bzs: block, bzv: Buffer.concat(records), bzz: packed };
}

function module(slots: readonly Slot[], recordSize: 10 | 12 = 10) {
  const usfms = BOOKS.map((book) => book.usfm);
  const ot = testament(usfms.slice(0, 39), slots, recordSize);
  const nt = testament(usfms.slice(39), slots, recordSize);
  const dir = "modules/comments/zcom/test";
  return new Map<string, Uint8Array>([
    ["mods.d/test.conf", Buffer.from("[Test]")],
    [`${dir}/ot.bzs`, ot.bzs],
    [`${dir}/ot.bzv`, ot.bzv],
    [`${dir}/ot.bzz`, ot.bzz],
    [`${dir}/nt.bzs`, nt.bzs],
    [`${dir}/nt.bzv`, nt.bzv],
    [`${dir}/nt.bzz`, nt.bzz],
  ]);
}

const SLOTS: Slot[] = [
  ["GEN", 1, 1, "In the beginning"],
  ["MAL", 4, 6, "The last verse of the Old Testament"],
  ["JHN", 3, 0, "On chapter three"],
  ["JHN", 3, 14, "14-16. And as Moses"],
  ["JHN", 3, 15, "14-16. And as Moses"],
  ["JHN", 3, 16, "14-16. And as Moses"],
  ["JHN", 3, 17, "17. not to condemn"],
  // After the chapters whose King James numbering is a verse shorter.
  ["3JN", 1, 14, "Peace be to thee"],
  ["JUD", 1, 1, "Jude, the servant"],
  ["REV", 12, 17, "And the dragon was wroth"],
  ["REV", 13, 1, "And I stood upon the sand"],
  ["REV", 22, 21, "The grace of our Lord"],
];

describe("readSwordModule", () => {
  for (const recordSize of [10, 12] as const) {
    it(`maps every slot of a ${recordSize === 10 ? "zCom" : "zCom4"} module to canonical verses`, () => {
      const entries = readSwordModule(module(SLOTS, recordSize));
      expect(
        entries.map((entry) => [entry.kind, entry.verseStart, entry.verseEnd, entry.osis]),
      ).toEqual([
        ["verses", 1001001, 1001001, "In the beginning"],
        ["verses", 39004006, 39004006, "The last verse of the Old Testament"],
        ["chapter", 43003001, 43003036, "On chapter three"],
        // Linked verses are one entry on the range.
        ["verses", 43003014, 43003016, "14-16. And as Moses"],
        ["verses", 43003017, 43003017, "17. not to condemn"],
        ["verses", 64001014, 64001014, "Peace be to thee"],
        ["verses", 65001001, 65001001, "Jude, the servant"],
        ["verses", 66012017, 66012017, "And the dragon was wroth"],
        ["verses", 66013001, 66013001, "And I stood upon the sand"],
        ["verses", 66022021, 66022021, "The grace of our Lord"],
      ]);
    });
  }

  it("refuses files that are not a module in the KJV versification", () => {
    const files = module(SLOTS);
    const short = new Map(files);
    short.set("modules/comments/zcom/test/nt.bzv", files.get("modules/comments/zcom/test/nt.bzv")!.subarray(10));
    expect(() => readSwordModule(short)).toThrow(/not a zCom module in the KJV versification/);

    const missing = new Map(files);
    missing.delete("modules/comments/zcom/test/ot.bzz");
    expect(() => readSwordModule(missing)).toThrow(/ot\.bzz is missing/);
  });
});

const entry = (
  kind: SwordEntry["kind"],
  book: number,
  chapter: number,
  verseStart: number,
  verseEnd: number,
  osis: string,
): SwordEntry => ({ kind, book, chapter, verseStart, verseEnd, osis });

const preverse = (text: string) =>
  `<div type="x-milestone" subType="x-preverse" sID="pv1"/>${text}<div type="x-milestone" subType="x-preverse" eID="pv1"/>`;

describe("normalizeSwordEntries", () => {
  it("stores comments on their verses and a chapter's own text on the chapter", () => {
    expect(
      normalizeSwordEntries([
        entry("chapter", 43, 3, 43003001, 43003036, '<chapter osisID="John.3"/> In this chapter'),
        entry("chapter", 43, 4, 43004001, 43004054, '<chapter osisID="John.4"/> '),
        entry("verses", 43, 3, 43003001, 43003021, '<div sID="a" type="x-p"/>A section.'),
        entry("verses", 43, 3, 43003022, 43003036, "Another."),
      ]),
    ).toEqual([
      { verseStart: 43003001, verseEnd: 43003036, html: "<p>In this chapter</p>" },
      { verseStart: 43003001, verseEnd: 43003021, html: "<p>A section.</p>" },
      { verseStart: 43003022, verseEnd: 43003036, html: "<p>Another.</p>" },
    ]);
  });

  it("stores a book's introduction on the whole book", () => {
    const introduction = `<title type="x-IS">INTRODUCTION</title> ${"The author of this Gospel. ".repeat(50)}`;
    const records = normalizeSwordEntries([
      entry("verses", 43, 1, 43001001, 43001001, `${preverse(introduction)}<hi type="bold">1. In the beginning</hi>`),
      // Titles before a verse are not an introduction.
      entry("verses", 43, 2, 43002001, 43002001, `${preverse('<title type="x-s2">CHAPTER 2</title>')}And the third day`),
      // Nor is a long text before a later chapter.
      entry("verses", 43, 3, 43003001, 43003001, `${preverse(introduction)}Nicodemus`),
    ]);
    expect(records.map((record) => [record.verseStart, record.verseEnd])).toEqual([
      [43001001, 43021025],
      [43001001, 43001001],
      [43002001, 43002001],
      [43003001, 43003001],
    ]);
    expect(records[0].html).toMatch(/^<h4>INTRODUCTION<\/h4><p>The author of this Gospel\./);
    expect(records[1].html).toBe("<p><b>1. In the beginning</b></p>");
    expect(records[2].html).toBe("<h4>CHAPTER 2</h4><p>And the third day</p>");
  });

  it("splits a chapter's introduction from its first verse where told to", () => {
    const osis =
      '<title type="x-s">Introduction</title> <div sID="a" type="x-p"/>The conversation with Nicodemus. ' +
      '<div eID="a" type="x-p"/><hi type="bold">Verse 1</hi> <div sID="b" type="x-p"/>Nicodemus, a ruler';
    const entries = [
      entry("verses", 43, 3, 43003001, 43003001, osis),
      entry("verses", 43, 3, 43003002, 43003002, '<hi type="bold">Verse 2</hi> Came by night'),
    ];
    expect(normalizeSwordEntries(entries, { firstVerseStarts: /<hi type="bold">Verse \d+/ })).toEqual([
      {
        verseStart: 43003001,
        verseEnd: 43003036,
        html: "<h4>Introduction</h4><p>The conversation with Nicodemus. </p>",
      },
      { verseStart: 43003001, verseEnd: 43003001, html: "<p><b>Verse 1</b> </p><p>Nicodemus, a ruler</p>" },
      { verseStart: 43003002, verseEnd: 43003002, html: "<p><b>Verse 2</b> Came by night</p>" },
    ]);
    expect(normalizeSwordEntries(entries)).toHaveLength(2);
  });

  it("can leave out the passage a comment quotes above itself", () => {
    const osis =
      '<title type="x-s3">The Divine Shepherd.</title> <div sID="a" type="x-p"/><hi type="super">1</hi> The Lord is my shepherd.' +
      '<div eID="a" type="x-p"/><div sID="b" type="x-p"/>From these words we learn.';
    const entries = [
      entry("verses", 19, 23, 19023001, 19023006, osis),
      // Nothing but the quotation: kept, rather than left empty.
      entry("verses", 19, 24, 19024001, 19024002, '<div sID="c" type="x-p"/><hi type="super">1</hi> The earth is the Lord\'s.'),
    ];
    expect(normalizeSwordEntries(entries, { omitQuotedPassage: true })).toEqual([
      {
        verseStart: 19023001,
        verseEnd: 19023006,
        html: "<h4>The Divine Shepherd.</h4><p>From these words we learn.</p>",
      },
      { verseStart: 19024001, verseEnd: 19024002, html: "<p><sup>1</sup> The earth is the Lord's.</p>" },
    ]);
    expect(normalizeSwordEntries(entries)[0].html).toContain("The Lord is my shepherd.");
  });

  it("joins entries that end up on the same range", () => {
    expect(
      normalizeSwordEntries([
        entry("chapter", 19, 117, 19117001, 19117002, "On the psalm."),
        entry("verses", 19, 117, 19117001, 19117002, "On its two verses."),
      ]),
    ).toEqual([
      { verseStart: 19117001, verseEnd: 19117002, html: "<p>On the psalm.</p><p>On its two verses.</p>" },
    ]);
  });
});
