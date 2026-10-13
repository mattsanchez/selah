import { describe, expect, it } from "vitest";

import type { VerseRecord } from "../types";
import { applyFormatting } from "./formatting";
import { parseUsfmBook } from "./usfm";

const record = (verseId: number, text: string, extra: Partial<VerseRecord> = {}): VerseRecord => ({
  verseId,
  text,
  headings: [],
  footnotes: [],
  breaks: [],
  wordsOfJesus: [],
  ...extra,
});
const john = (chapter: number, body: string) => [
  parseUsfmBook(`\\id JHN\n\\c ${chapter}\n${body}`),
];
const words = (verse: VerseRecord) =>
  verse.wordsOfJesus.map(({ start, end }) => verse.text.slice(start, end));

describe("applyFormatting: words of Jesus", () => {
  const options = { translationId: "bsb", kind: "wordsOfJesus" } as const;

  it("moves each span onto the stored text, whatever the spacing and line breaks", () => {
    // The stored verse breaks its lines and sets its dash differently.
    const stored = [
      record(43_003_003, "Jesus replied,\n“Truly, truly,\nI tell you— no one can see.”", {
        footnotes: [{ offset: 14, text: "A note" }],
        breaks: [{ offset: 0, kind: "paragraph" }],
      }),
      record(43_003_004, "“How?” Nicodemus asked."),
    ];
    const books = john(
      3,
      "\\p \\v 3 Jesus replied, \\wj “Truly,  truly, I tell you—no one can see.”\\wj*\n\\p \\v 4 “How?” Nicodemus asked.",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(words(verses[0])).toEqual(["“Truly, truly,\nI tell you— no one can see.”"]);
    expect(verses[0].wordsOfJesus).toEqual([{ start: 15, end: 58 }]);
    expect(verses[1].wordsOfJesus).toEqual([]);
    // Nothing else about a verse changes, and the input is left alone.
    expect({ ...verses[0], wordsOfJesus: [] }).toEqual(stored[0]);
    expect(stored[0].wordsOfJesus).toEqual([]);
    expect(report).toMatchObject({ marked: 1, applied: 1, added: 1, skipped: [] });
  });

  it("keeps two speeches in a verse apart and joins pieces only whitespace separates", () => {
    const stored = [
      record(43_021_015, "Jesus asked, “Do you love Me?”\n“Yes,” he answered. “Feed My lambs,”\n“and follow.”"),
    ];
    const books = john(
      21,
      "\\p \\v 15 Jesus asked, \\wj “Do you love Me?”\\wj* “Yes,” he answered. \\wj “Feed My lambs,”\\wj*\n\\q1 \\wj “and follow.”\\wj*",
    );
    const { verses } = applyFormatting(stored, books, options);
    expect(words(verses[0])).toEqual(["“Do you love Me?”", "“Feed My lambs,”\n“and follow.”"]);
  });

  it("sets aside a bracketed closing quotation mark at the end of the source's verse", () => {
    // BSB John 13:38 and 14:31: the USFM closes the speech with a bracketed
    // mark the stored text does not have.
    const stored = [
      record(
        43_013_038,
        "“Will you lay down your life for Me?” Jesus replied. “Truly, truly, I tell you, you will deny Me three times.",
      ),
      record(43_014_031, "that I love the Father.\nGet up! Let us go on from here.", {
        breaks: [{ offset: 24, kind: "paragraph" }],
      }),
    ];
    const books = [
      ...john(
        13,
        "\\p \\v 38 \\wj “Will you lay down your life for Me?”\\wj* Jesus replied. \\wj “Truly, truly, I tell you, you will deny Me three times.[’’]\\wj*",
      ),
      ...john(
        14,
        "\\p \\v 31 \\wj that I love the Father.\\wj*\n\\p \\wj Get up! Let us go on from here.[’’]\\wj*",
      ),
    ];
    const { verses, report } = applyFormatting(stored, books, options);

    expect(words(verses[0])).toEqual([
      "“Will you lay down your life for Me?”",
      "“Truly, truly, I tell you, you will deny Me three times.",
    ]);
    expect(words(verses[1])).toEqual([stored[1].text]);
    expect(verses.map((v) => v.text)).toEqual(stored.map((v) => v.text));
    expect(verses[1].breaks).toEqual(stored[1].breaks);
    expect(report).toMatchObject({ marked: 2, applied: 2, added: 3, skipped: [] });
    expect(report.punctuationDiffers).toEqual([43_013_038, 43_014_031]);
  });

  it("marks a verse whose punctuation differs clear of where its spans start and end", () => {
    // BSB Mark 12:29 and Luke 5:24: a comma, and "…" against "...".
    const stored = [
      record(41_012_029, "Jesus replied, “This is the most important: ‘Hear O Israel, the Lord is One."),
      record(42_005_024, "to forgive sins...” He said to the paralytic, “I tell you, get up.”"),
    ];
    const books = [
      parseUsfmBook(
        "\\id MRK\n\\c 12\n\\p \\v 29 Jesus replied, \\wj “This is the most important: ‘Hear, O Israel, the Lord is One.\\wj*",
      ),
      parseUsfmBook(
        "\\id LUK\n\\c 5\n\\p \\v 24 \\wj to forgive sins…”\\wj* He said to the paralytic, \\wj “I tell you, get up.”\\wj*",
      ),
    ];
    const { verses, report } = applyFormatting(stored, books, options);

    expect(words(verses[0])).toEqual(["“This is the most important: ‘Hear O Israel, the Lord is One."]);
    expect(words(verses[1])).toEqual(["to forgive sins...”", "“I tell you, get up.”"]);
    expect(verses.map((v) => v.text)).toEqual(stored.map((v) => v.text));
    expect(report.skipped).toEqual([]);
    expect(report.punctuationDiffers).toEqual([41_012_029, 42_005_024]);
  });

  it("skips a verse whose punctuation differs where a span starts or ends", () => {
    // BSB John 6:42: the span ends on the closing quotation mark, which the
    // two sources put on either side of the question mark.
    const stored = [
      record(43_006_042, "How then can He say, ‘I have come down from heaven?’”"),
      // A bracketed mark is set aside only at the end of the verse, and only
      // a closing quotation mark.
      record(43_006_043, "“Stop grumbling among yourselves,” Jesus replied."),
      record(43_006_044, "No one can come to Me unless the Father draws him."),
    ];
    const books = john(
      6,
      "\\p \\v 42 How then can He say, \\wj ‘I have come down from heaven’\\wj*?”\n" +
        "\\p \\v 43 \\wj “Stop grumbling among yourselves,[”]\\wj* Jesus replied.\n" +
        "\\v 44 \\wj No one can come to Me unless the Father draws him.[a]\\wj*",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses).toEqual(stored);
    expect(report).toMatchObject({ marked: 3, applied: 0, added: 0, punctuationDiffers: [] });
    expect(report.skipped).toEqual([
      { verseId: 43_006_042, reason: "text differs" },
      { verseId: 43_006_043, reason: "text differs" },
      { verseId: 43_006_044, reason: "text differs" },
    ]);
  });

  it("skips a verse whose words differ, however slightly, and reports it", () => {
    const stored = [
      record(43_008_012, "“I am the light of the world.”"),
      record(43_008_058, "“Truly, truly, I tell you,” Jesus declared, “before Abraham was born, I am!”"),
    ];
    const books = john(
      8,
      "\\p \\v 12 \\wj “I am the Light of the world.”\\wj*\n" +
        "\\p \\v 58 \\wj “Truly, truly, I tell you,”\\wj* Jesus said, \\wj “before Abraham was born, I am!”\\wj*",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses).toEqual(stored);
    expect(report).toMatchObject({ marked: 2, applied: 0, added: 0 });
    expect(report.skipped).toEqual([
      { verseId: 43_008_012, reason: "text differs" },
      { verseId: 43_008_058, reason: "text differs" },
    ]);
  });

  it("skips a marked verse the translation does not have", () => {
    const { verses, report } = applyFormatting(
      [record(43_005_003, "Here lay a great number of the sick.")],
      john(5, "\\p \\v 3 Here lay a great number of the sick.\n\\v 4 \\wj An added verse.\\wj*"),
      options,
    );
    expect(verses[0].wordsOfJesus).toEqual([]);
    expect(report.skipped).toEqual([{ verseId: 43_005_004, reason: "no such verse" }]);
  });

  it("never leaves a span starting or ending on whitespace", () => {
    const stored = [record(43_011_043, "He cried out,\n“Lazarus, come out!”")];
    const books = john(11, "\\p \\v 43 He cried out,\\wj  “Lazarus, come out!” \\wj*");
    const { verses } = applyFormatting(stored, books, options);
    expect(words(verses[0])).toEqual(["“Lazarus, come out!”"]);
  });
});

describe("applyFormatting: paragraphs", () => {
  const options = { translationId: "web", kind: "paragraphs" } as const;

  it("opens a paragraph on the verses the source opens one on", () => {
    const stored = [
      record(43_003_001, "Now there was a man of the Pharisees."),
      record(43_003_002, "He came to Jesus by night."),
      record(43_003_003, "Jesus answered him."),
    ];
    const books = john(
      3,
      "\\p\n\\v 1 Now there was a man of the Pharisees.\n\\v 2 He came to Jesus by night.\n\\p\n\\v 3 Jesus answered him.",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses.map((v) => v.breaks)).toEqual([
      [{ offset: 0, kind: "paragraph" }],
      [],
      [{ offset: 0, kind: "paragraph" }],
    ]);
    expect(verses.map((v) => v.text)).toEqual(stored.map((v) => v.text));
    expect(report).toMatchObject({ marked: 2, applied: 2, added: 2, alreadyThere: 0 });
  });

  it("keeps what is there: a stanza stays, and a line start becomes the paragraph", () => {
    const stored = [
      record(43_012_038, "that the word might be fulfilled:\n“Lord, who has believed?”", {
        breaks: [{ offset: 0, kind: "paragraph" }, { offset: 34, kind: "paragraph" }],
      }),
      record(43_012_039, "For this cause they couldn’t believe.", {
        breaks: [{ offset: 0, kind: "line" }],
      }),
    ];
    const books = john(
      12,
      "\\p\n\\v 38 that the word might be fulfilled:\n\\q1 “Lord, who has believed?”\n\\p\n\\v 39 For this cause they couldn’t believe.",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses[0].breaks).toEqual(stored[0].breaks);
    expect(verses[1].breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
    expect(report).toMatchObject({ added: 1, alreadyThere: 1 });
  });

  it("starts a paragraph inside a verse, turning the space before it into a line break", () => {
    const stored = [
      record(43_001_021, "They asked him, “Are you Elijah?”\nHe said, “I am not.”"),
      // WEB John 1:38-39: a change of speaker, with a footnote and red-letter
      // text on either side of it.
      record(43_001_038, "He said, “What are you looking for?” They said to him, “Rabbi.”", {
        footnotes: [{ offset: 36, text: "A note before the break" }],
        wordsOfJesus: [{ start: 9, end: 36 }],
      }),
      record(43_001_039, "“Come and see.” They came and saw. It was about the tenth hour.", {
        footnotes: [{ offset: 63, text: "4:00 p.m." }],
        wordsOfJesus: [{ start: 0, end: 15 }],
      }),
    ];
    const books = john(
      1,
      "\\p\n\\v 21 They asked him, “Are you Elijah?”\n\\p He said, “I am not.”\n" +
        "\\p\n\\v 38 He said, \\wj “What are you looking for?”\\wj*\n\\p They said to him, “Rabbi.”\n" +
        "\\p\n\\v 39 \\wj “Come and see.”\\wj*\n\\p They came and saw. It was about the tenth hour.",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    // A line break that was there is used as it is.
    expect(verses[0]).toEqual({
      ...stored[0],
      breaks: [{ offset: 0, kind: "paragraph" }, { offset: 34, kind: "paragraph" }],
    });
    expect(verses[1].text).toBe("He said, “What are you looking for?”\nThey said to him, “Rabbi.”");
    expect(verses[1].breaks).toEqual([
      { offset: 0, kind: "paragraph" },
      { offset: 37, kind: "paragraph" },
    ]);
    expect(verses[2].text).toBe("“Come and see.”\nThey came and saw. It was about the tenth hour.");
    expect(verses[2].breaks).toEqual([
      { offset: 0, kind: "paragraph" },
      { offset: 16, kind: "paragraph" },
    ]);
    // Only that one character changes, so nothing else moves.
    for (const [i, verse] of verses.entries()) {
      expect(verse.text.replaceAll("\n", " ")).toBe(stored[i].text.replaceAll("\n", " "));
      expect(verse.footnotes).toEqual(stored[i].footnotes);
      expect(verse.wordsOfJesus).toEqual(stored[i].wordsOfJesus);
    }
    expect(stored[1].text).not.toContain("\n");
    expect(report).toMatchObject({ added: 6, alreadyThere: 0, lineBreaks: 2, unplaced: [] });
  });

  it("starts every paragraph of a verse that has several, and keeps a span across one whole", () => {
    const stored = [
      record(43_001_021, "“What then?” He said, “I am not.” “Are you the prophet?” He answered, “No.”", {
        wordsOfJesus: [{ start: 22, end: 56 }],
      }),
    ];
    const books = john(
      1,
      "\\p\n\\v 21 “What then?”\n\\p He said, “I am not.”\n\\p “Are you the prophet?”\n\\p He answered, “No.”",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses[0].text).toBe(
      "“What then?”\nHe said, “I am not.”\n“Are you the prophet?”\nHe answered, “No.”",
    );
    expect(verses[0].breaks.map((item) => item.offset)).toEqual([0, 13, 34, 57]);
    expect(words(verses[0])).toEqual(["“I am not.”\n“Are you the prophet?”"]);
    expect(report.lineBreaks).toBe(3);
  });

  it("leaves out a paragraph inside a verse where the text has no space to turn", () => {
    const stored = [record(43_001_022, "They said, “Who are you?”—He answered them.")];
    const books = john(1, "\\p\n\\v 22 They said, “Who are you?”—\n\\p He answered them.");
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses[0].text).toBe(stored[0].text);
    expect(verses[0].breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
    expect(report.unplaced).toEqual([{ verseId: 43_001_022, offset: 26 }]);
    expect(report).toMatchObject({ added: 1, lineBreaks: 0 });
  });

  it("does not make allowances for punctuation: only red-letter text does", () => {
    const stored = [record(43_003_001, "Now there was a man of the Pharisees.")];
    const books = john(3, "\\p\n\\v 1 Now there was a man, of the Pharisees.[’’]");
    const { verses, report } = applyFormatting(stored, books, options);
    expect(verses).toEqual(stored);
    expect(report.skipped).toEqual([{ verseId: 43_003_001, reason: "text differs" }]);
  });

  it("skips a verse whose words differ and reports it", () => {
    const stored = [record(43_003_001, "Now there was a man of the Pharisees.")];
    const books = john(3, "\\p\n\\v 1 Now there was a man from the Pharisees.");
    const { verses, report } = applyFormatting(stored, books, options);
    expect(verses).toEqual(stored);
    expect(report.skipped).toEqual([{ verseId: 43_003_001, reason: "text differs" }]);
  });

  it("follows the translation's renumbering", () => {
    // The WEB prints the doxology of Romans as 14:24-26; it is stored at 16:25-27.
    const stored = [record(45_016_025, "Now to him who is able to establish you")];
    const books = [
      parseUsfmBook("\\id ROM\n\\c 14\n\\p\n\\v 24 Now to him who is able to establish you"),
    ];
    const { verses } = applyFormatting(stored, books, options);
    expect(verses[0].breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
  });
});
