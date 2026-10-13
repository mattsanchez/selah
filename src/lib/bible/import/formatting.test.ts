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

  it("skips a verse whose words differ, however slightly, and reports it", () => {
    // BSB John 6:42 and 13:38: the two sources punctuate the end differently.
    const stored = [
      record(43_006_042, "How then can He say, ‘I have come down from heaven?’”"),
      record(43_013_038, "“Truly, I tell you, you will deny Me three times."),
      record(43_013_037, "Peter said, “Lord, why can’t I follow You now?”"),
    ];
    const books = [
      ...john(6, "\\p \\v 42 How then can He say, \\wj ‘I have come down from heaven’?”\\wj*"),
      ...john(
        13,
        "\\p \\v 37 Peter said, “Lord, why can’t I follow You now?”\n\\p \\v 38 \\wj “Truly, I tell you, you will deny Me three times.’’\\wj*",
      ),
    ];
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses).toEqual(stored);
    expect(report).toMatchObject({ marked: 2, applied: 0, added: 0 });
    expect(report.skipped).toEqual([
      { verseId: 43_006_042, reason: "text differs" },
      { verseId: 43_013_038, reason: "text differs" },
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

  it("stores a paragraph inside a verse only where the text has a line break", () => {
    const stored = [
      record(43_001_021, "They asked him, “Are you Elijah?”\nHe said, “I am not.”"),
      record(43_001_022, "They said, “Who are you?” He answered them."),
    ];
    const books = john(
      1,
      "\\p\n\\v 21 They asked him, “Are you Elijah?”\n\\p He said, “I am not.”\n\\p\n\\v 22 They said, “Who are you?”\n\\p He answered them.",
    );
    const { verses, report } = applyFormatting(stored, books, options);

    expect(verses[0].breaks).toEqual([
      { offset: 0, kind: "paragraph" },
      { offset: 34, kind: "paragraph" },
    ]);
    // The text is never changed to make room for a break.
    expect(verses[1].breaks).toEqual([{ offset: 0, kind: "paragraph" }]);
    expect(verses[1].text).toBe(stored[1].text);
    expect(report.unplaced).toEqual([{ verseId: 43_001_022, offset: 26 }]);
    expect(report.added).toBe(3);
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
