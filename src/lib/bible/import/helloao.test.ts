import { describe, expect, it } from "vitest";

import {
  flattenInline,
  normalizeTranslation,
  type HelloaoTranslation,
} from "./helloao";

const notes = new Map([
  [1, "first note"],
  [2, "second note"],
]);

type Chapter = HelloaoTranslation["books"][number]["chapters"][number]["chapter"];

const translation = (
  usfm: string,
  ...chapters: (Pick<Chapter, "number" | "content"> & Partial<Chapter>)[]
): HelloaoTranslation => ({
  books: [
    {
      id: usfm,
      chapters: chapters.map((chapter) => ({ chapter: { footnotes: [], ...chapter } })),
    },
  ],
});

describe("flattenInline", () => {
  it("joins prose around a note and records where the note falls", () => {
    const { text, footnotes } = flattenInline(
      ["which in Hebrew", { noteId: 1 }, "is called Bethesda.", { noteId: 2 }],
      notes,
    );
    expect(text).toBe("which in Hebrew is called Bethesda.");
    expect(footnotes).toEqual([
      { offset: 15, text: "first note" },
      { offset: 35, text: "second note" },
    ]);
    expect(text.slice(0, footnotes[0].offset)).toBe("which in Hebrew");
  });

  it("adds no space before closing or after opening punctuation", () => {
    expect(flattenInline(["of faith", { noteId: 1 }, "—", "to God"], notes).text).toBe(
      "of faith—to God",
    );
    expect(flattenInline(["he said, “Go", { noteId: 1 }, "”"], notes).text).toBe(
      "he said, “Go”",
    );
    expect(flattenInline(["(", "an aside", ")"], notes).text).toBe("(an aside)");
  });

  it("puts each line of poetry on its own line", () => {
    const { text, footnotes } = flattenInline(
      [
        { text: "Many say of me,", poem: 1 },
        { text: "“God will not deliver him.”", poem: 2 },
        "Selah",
        { noteId: 1 },
      ],
      notes,
    );
    expect(text).toBe("Many say of me,\n“God will not deliver him.”\nSelah");
    expect(footnotes).toEqual([{ offset: text.length, text: "first note" }]);
  });

  it("keeps a line of poetry whole when a note splits it", () => {
    const { text, footnotes } = flattenInline(
      [
        { text: "Blessed", poem: 1 },
        { noteId: 1 },
        { text: "are those whose way is blameless,", poem: 1 },
        { text: "who walk in the Law of the LORD.", poem: 2 },
      ],
      notes,
    );
    expect(text).toBe(
      "Blessed are those whose way is blameless,\nwho walk in the Law of the LORD.",
    );
    expect(footnotes).toEqual([{ offset: 7, text: "first note" }]);
  });

  it("starts a new line after a note that ends a clause or changes the indent", () => {
    expect(
      flattenInline(
        [{ text: "with all my heart;", poem: 1 }, { noteId: 1 }, { text: "I will tell", poem: 1 }],
        notes,
      ).text,
    ).toBe("with all my heart;\nI will tell");
    expect(
      flattenInline(
        [{ text: "The LORD is my rock", poem: 1 }, { noteId: 1 }, { text: "and my fortress", poem: 2 }],
        notes,
      ).text,
    ).toBe("The LORD is my rock\nand my fortress");
  });

  it("honors explicit line breaks and ignores a trailing one", () => {
    expect(
      flattenInline(["Peace to you.", { lineBreak: true }, "Greet the friends."], notes).text,
    ).toBe("Peace to you.\nGreet the friends.");
    expect(
      flattenInline([{ text: "A line.", poem: 1 }, { noteId: 1 }, { lineBreak: true }], notes),
    ).toEqual({ text: "A line.", footnotes: [{ offset: 7, text: "first note" }] });
  });

  it("keeps the words of Jesus as plain text", () => {
    expect(
      flattenInline(["Jesus answered,", { text: "“Follow me.”", wordsOfJesus: true }], notes).text,
    ).toBe("Jesus answered, “Follow me.”");
  });

  it("fails on a note the chapter does not define", () => {
    expect(() => flattenInline(["text", { noteId: 9 }], notes)).toThrow("Missing footnote 9");
  });
});

describe("normalizeTranslation", () => {
  it("attaches section headings to the verse they precede", () => {
    const verses = normalizeTranslation(
      translation("JHN", {
        number: 1,
        content: [
          { type: "heading", content: ["The Beginning"] },
          { type: "verse", number: 1, content: ["In the beginning was the Word."] },
          { type: "line_break" },
          { type: "verse", number: 2, content: ["He was with God in the beginning."] },
          { type: "heading", content: ["The Witness of John"] },
          { type: "verse", number: 3, content: ["Through Him all things were made."] },
        ],
      }),
      { translationId: "bsb" },
    );
    expect(verses).toEqual([
      {
        verseId: 43_001_001,
        text: "In the beginning was the Word.",
        headings: [{ kind: "section", text: "The Beginning" }],
        footnotes: [],
      },
      {
        verseId: 43_001_002,
        text: "He was with God in the beginning.",
        headings: [],
        footnotes: [],
      },
      {
        verseId: 43_001_003,
        text: "Through Him all things were made.",
        headings: [{ kind: "section", text: "The Witness of John" }],
        footnotes: [],
      },
    ]);
  });

  it("stores a psalm superscription as a heading of verse 1, not as a verse", () => {
    const verses = normalizeTranslation(
      translation("PSA", {
        number: 3,
        content: [
          { type: "heading", content: ["Deliver Me, O LORD!"] },
          {
            type: "hebrew_subtitle",
            content: ["A Psalm of David, when he fled from his son Absalom.", { noteId: 1 }],
          },
          { type: "line_break" },
          {
            type: "verse",
            number: 1,
            content: [
              { text: "O LORD, how my foes have increased!", poem: 1 },
              { text: "How many rise up against me!", poem: 2 },
            ],
          },
        ],
        footnotes: [{ noteId: 1, text: "A note on the title" }],
      }),
      { translationId: "bsb" },
    );
    expect(verses).toEqual([
      {
        verseId: 19_003_001,
        text: "O LORD, how my foes have increased!\nHow many rise up against me!",
        headings: [
          { kind: "section", text: "Deliver Me, O LORD!" },
          {
            kind: "superscription",
            text: "A Psalm of David, when he fled from his son Absalom.",
            footnotes: [{ offset: 52, text: "A note on the title" }],
          },
        ],
        footnotes: [],
      },
    ]);
  });

  it("turns the WEB's Psalm 119 stanza letters into section headings", () => {
    const content: Chapter["content"] = [{ type: "hebrew_subtitle", content: ["ALEPH"] }];
    for (let number = 1; number <= 9; number++) {
      content.push({
        type: "verse",
        number,
        content: [
          { text: `Line ${number}.`, poem: 1 },
          ...(number === 8 ? [{ text: "BETH", descriptive: true }] : []),
        ],
      });
    }
    const verses = normalizeTranslation(translation("PSA", { number: 119, content }), {
      translationId: "web",
    });
    expect(verses[0].headings).toEqual([{ kind: "section", text: "ALEPH" }]);
    expect(verses[7]).toMatchObject({ text: "Line 8.", headings: [] });
    expect(verses[8].headings).toEqual([{ kind: "section", text: "BETH" }]);
  });

  it("keeps descriptive text that is part of a verse", () => {
    const [verse] = normalizeTranslation(
      translation("ZEC", {
        number: 12,
        content: [
          {
            type: "verse",
            number: 1,
            content: [{ text: "This is the burden of the word.", descriptive: true }, "Thus declares the LORD."],
          },
        ],
      }),
      { translationId: "bsb" },
    );
    expect(verse.text).toBe("This is the burden of the word. Thus declares the LORD.");
  });

  it("attaches a closing heading to the last verse as a subscription", () => {
    const verses = normalizeTranslation(
      translation("ROM", {
        number: 16,
        content: [
          { type: "verse", number: 26, content: ["But now is made manifest."] },
          { type: "verse", number: 27, content: ["To God only wise, be glory. Amen."] },
          { type: "heading", content: ["Written to the Romans from Corinthus."] },
        ],
      }),
      { translationId: "kjv" },
    );
    expect(verses[0].headings).toEqual([]);
    expect(verses[1].headings).toEqual([
      { kind: "subscription", text: "Written to the Romans from Corinthus." },
    ]);
  });

  it("renumbers the WEB's Romans doxology and drops its empty 16:25", () => {
    const verses = normalizeTranslation(
      translation(
        "ROM",
        {
          number: 14,
          content: [
            { type: "verse", number: 23, content: ["Whatever is not of faith is sin."] },
            { type: "verse", number: 24, content: ["Now to him who is able to establish you,"] },
            { type: "verse", number: 25, content: ["but now is revealed;"] },
            { type: "verse", number: 26, content: ["to the only wise God. Amen.", { noteId: 1 }] },
          ],
          footnotes: [{ noteId: 1, text: "TR places verses 24-26 after Romans 16:24." }],
        },
        {
          number: 16,
          content: [
            { type: "verse", number: 24, content: ["The grace of our Lord be with you all!"] },
            { type: "verse", number: 25, content: [{ noteId: 2 }] },
          ],
          footnotes: [{ noteId: 2, text: "TR numbers these verses 16:25-27." }],
        },
      ),
      { translationId: "web" },
    );
    expect(verses.map((verse) => verse.verseId)).toEqual([
      45_014_023, 45_016_024, 45_016_025, 45_016_026, 45_016_027,
    ]);
    expect(verses[2].text).toBe("Now to him who is able to establish you,");
    expect(verses[4].footnotes).toEqual([
      { offset: 27, text: "TR places verses 24-26 after Romans 16:24." },
    ]);
    // The note of the empty verse moves to the end of the verse before it.
    expect(verses[1].footnotes).toEqual([
      { offset: verses[1].text.length, text: "TR numbers these verses 16:25-27." },
    ]);
  });

  it("leaves out a verse the translation omits", () => {
    // The BSB has no John 5:4; the source skips the number.
    const verses = normalizeTranslation(
      translation("JHN", {
        number: 5,
        content: [
          { type: "verse", number: 3, content: ["On these walkways lay the sick.", { noteId: 1 }] },
          { type: "verse", number: 5, content: ["One man there had been an invalid."] },
        ],
        footnotes: [{ noteId: 1, text: "BYZ and TR include verse 4." }],
      }),
      { translationId: "bsb" },
    );
    expect(verses.map((verse) => verse.verseId)).toEqual([43_005_003, 43_005_005]);
  });

  it("cleans up the KJV's note prefixes and paragraph marks when asked", () => {
    const source = translation("JHN", {
      number: 3,
      content: [
        { type: "verse", number: 16, content: ["¶ For God so loved", { noteId: 1 }, "the world."] },
      ],
      footnotes: [{ noteId: 1, text: "3.16 loved: Gr. agapao" }],
    });
    expect(
      normalizeTranslation(source, {
        translationId: "kjv",
        stripFootnoteOrigin: true,
        stripParagraphMarks: true,
      }),
    ).toEqual([
      {
        verseId: 43_003_016,
        text: "For God so loved the world.",
        headings: [],
        footnotes: [{ offset: 16, text: "loved: Gr. agapao" }],
      },
    ]);
    expect(normalizeTranslation(source, { translationId: "kjv" })[0]).toMatchObject({
      text: "¶ For God so loved the world.",
      footnotes: [{ offset: 18, text: "3.16 loved: Gr. agapao" }],
    });
  });

  it("keeps only the requested books and returns verses in canonical order", () => {
    const source: HelloaoTranslation = {
      books: ["ROM", "GEN", "JHN"].map((id) => ({
        id,
        chapters: [
          {
            chapter: {
              number: 1,
              content: [{ type: "verse", number: 1, content: [`${id} 1:1`] }],
              footnotes: [],
            },
          },
        ],
      })),
    };
    expect(
      normalizeTranslation(source, { translationId: "bsb", books: ["JHN", "ROM"] }).map(
        (verse) => verse.text,
      ),
    ).toEqual(["JHN 1:1", "ROM 1:1"]);
    expect(normalizeTranslation(source, { translationId: "bsb" })).toHaveLength(3);
  });

  it("refuses verses outside the canonical versification and duplicate ids", () => {
    const verse = (number: number): Chapter["content"][number] => ({
      type: "verse",
      number,
      content: ["text"],
    });
    expect(() =>
      normalizeTranslation(translation("3JN", { number: 1, content: [verse(16)] }), {
        translationId: "bsb",
      }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeTranslation(translation("JHN", { number: 1, content: [verse(1), verse(1)] }), {
        translationId: "bsb",
      }),
    ).toThrow("already used");
  });
});
