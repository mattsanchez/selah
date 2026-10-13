import { describe, expect, it } from "vitest";

import { parseUsfmBook, type UsfmVerse } from "./usfm";

const parse = (body: string) => parseUsfmBook(`\\id JHN test\n\\h John\n\\c 3\n${body}`).verses;
const words = (verse: UsfmVerse) =>
  verse.wordsOfJesus.map(({ start, end }) => verse.text.slice(start, end));

describe("parseUsfmBook", () => {
  it("reads the book code and each verse's reference and words", () => {
    const book = parseUsfmBook(
      "\uFEFF\\id JHN 43-JHN-web.sfm World English Bible\n\\ide UTF-8\n\\mt1 John\n" +
        "\\c 11\n\\p\n\\v 34 He said, “Where have you laid him?”\n\\v 35 Jesus wept.\n" +
        "\\c 12\n\\p\n\\v 1 Then six days before the Passover,",
    );
    expect(book.id).toBe("JHN");
    expect(book.verses.map((v) => [v.chapter, v.verse, v.text])).toEqual([
      [11, 34, "He said, “Where have you laid him?”"],
      [11, 35, "Jesus wept."],
      [12, 1, "Then six days before the Passover,"],
    ]);
  });

  it("drops Strong's numbers, notes, cross references and headings", () => {
    const [first, second] = parse(
      "\\s1 Jesus and Nicodemus\n\\r (\\ref Genesis 22:1–10|GEN 22:1-10\\ref*)\n\\p\n" +
        '\\v 1 \\w Now|strong="G1161"\\w* there \\w was|strong="G1510"\\w* a man,\\x - \\xo 3:1 \\xt John 7:50\\x*\n' +
        '\\v 2 who hasn’\\w t|strong="G3588"\\w* overcome\\f + \\fr 3:2 \\ft Or \\fqa \\fv 3\\fv*understood\\f* it. \\qs Selah.\\qs*',
    );
    expect(first.text).toBe("Now there was a man,");
    expect(second.text).toBe("who hasn’t overcome it. Selah.");
  });

  it("keeps a psalm superscription and an acrostic letter out of the verse", () => {
    // The BSB opens verse 1 inside the superscription; the WEB sets the next
    // stanza's letter after the last line of a verse.
    const verses = parse(
      "\\d \\v 1 A Psalm of David.\n\\b\n\\q1 O LORD, how my foes have increased!\n" +
        "\\q2 How many rise up against me!\n\\d BETH\n\\q1\n\\v 2 Many say of me,",
    );
    expect(verses.map((v) => v.text)).toEqual([
      "O LORD, how my foes have increased! How many rise up against me!",
      "Many say of me,",
    ]);
  });

  it("marks where a prose paragraph starts, between verses and inside one", () => {
    const verses = parse(
      "\\p\n\\v 1 Now there was a man.\n\\v 2 He came by night.\n" +
        "\\p\n\\v 3 Jesus answered him.\n\\p Nicodemus said,\n\\pi1 “How?”\n\\v 4 He asked again.",
    );
    expect(verses.map((v) => v.paragraphs)).toEqual([[0], [], [0, 20, 36], []]);
    const third = verses[2];
    expect(third.text).toBe("Jesus answered him. Nicodemus said, “How?”");
    expect(third.paragraphs.map((offset) => third.text.slice(offset, offset + 4))).toEqual([
      "Jesu", "Nico", "“How",
    ]);
  });

  it("does not count poetry, lists, continuations or an empty paragraph as paragraphs", () => {
    const verses = parse(
      "\\q1\n\\v 1 A line of a psalm,\n\\q2 and its second half.\n\\b\n\\q1\n\\v 2 A new stanza.\n" +
        "\\m\n\\v 3 Prose that carries on.\n\\li1\n\\v 4 A list item.\n\\nb\n\\v 5 No break.\n" +
        "\\p\n\\s1 A heading\n\\q1\n\\v 6 Poetry after an empty paragraph.",
    );
    expect(verses.map((v) => v.paragraphs)).toEqual([[], [], [], [], [], []]);
  });

  it("gives a paragraph that opens on an empty verse to the next verse with text", () => {
    const verses = parse("\\p\n\\v 36 \\f + \\fr 17:36 \\ft Some add a verse.\\f*\n\\v 37 They answered,");
    expect(verses.map((v) => [v.verse, v.text, v.paragraphs])).toEqual([
      [36, "", []],
      [37, "They answered,", [0]],
    ]);
  });

  it("marks the words of Jesus in part of a verse", () => {
    const [verse] = parse("\\p \\v 3 Jesus replied, \\wj “Truly, I tell you.”\\wj* Then he left.");
    expect(verse.text).toBe("Jesus replied, “Truly, I tell you.” Then he left.");
    expect(words(verse)).toEqual(["“Truly, I tell you.”"]);
  });

  it("carries a speech across verses and paragraphs, one span per verse", () => {
    // BSB John 3:10-12: \wj opens before the verse marker, closes and reopens
    // around "said Jesus", and stays open over a new paragraph and verse.
    const verses = parse(
      "\\p \\wj \\v 10 “You are Israel’s teacher,”\\wj* said Jesus, \\wj “and you do not understand? " +
        "\\v 11 Truly, we speak of what we know.\\wj*\n\\p \\v 12 \\wj If I have told you.\n" +
        "\\v 13 No one has ascended.”\\wj*\n\\p \\v 14 “How?” they asked.",
    );
    expect(verses.map(words)).toEqual([
      ["“You are Israel’s teacher,”", "“and you do not understand?"],
      ["Truly, we speak of what we know."],
      ["If I have told you."],
      ["No one has ascended.”"],
      [],
    ]);
    expect(verses[1].wordsOfJesus).toEqual([{ start: 0, end: verses[1].text.length }]);
  });

  it("joins marked pieces that only a note or nested markup separates", () => {
    // WEB John 3:3 closes \wj for a note and reopens it; its words are nested.
    const [verse] = parse(
      '\\p\n\\v 3 Jesus answered, \\wj “\\+w Most|strong="G2316"\\+w* certainly, unless one is born anew, \\wj*' +
        "\\f + \\fr 3:3 \\ft Or “again”.\\f* \\wj he can’t see God’s Kingdom.”\\wj*",
    );
    expect(words(verse)).toEqual([
      "“Most certainly, unless one is born anew, he can’t see God’s Kingdom.”",
    ]);
  });

  it("refuses markup it does not know, a verse range and a file with no id", () => {
    expect(() => parse("\\p\n\\v 1 Some \\zzz text")).toThrow("unknown marker \\zzz");
    expect(() => parse("\\p\n\\v 1-2 Two verses in one")).toThrow("without a plain number");
    expect(() => parse("\\p Text before any verse")).toThrow("text before the first verse");
    expect(() => parseUsfmBook("\\c 1\n\\p\n\\v 1 Text")).toThrow();
  });
});
