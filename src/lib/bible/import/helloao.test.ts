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

  it("keeps pieces at one indent on one line and starts a line when the indent changes", () => {
    expect(
      flattenInline(
        [
          { text: "“There is no help for him in God.”", poem: 2 },
          { noteId: 1 },
          { text: "Selah.", poem: 2 },
        ],
        notes,
      ).text,
    ).toBe("“There is no help for him in God.” Selah.");
    expect(
      flattenInline(
        [{ text: "The LORD is my rock", poem: 1 }, { noteId: 1 }, { text: "and my fortress", poem: 2 }],
        notes,
      ).text,
    ).toBe("The LORD is my rock\nand my fortress");
    expect(
      flattenInline(["He said:", { text: "“Because you have done this,", poem: 1 }], notes).text,
    ).toBe("He said:\n“Because you have done this,");
  });

  it("reads a line break in prose as a paragraph break inside the verse", () => {
    const flat = flattenInline(
      ["I hope to see you soon.", { lineBreak: true }, "Peace to you.", { lineBreak: true }, "Greet the friends."],
      notes,
    );
    expect(flat.text).toBe("I hope to see you soon.\nPeace to you.\nGreet the friends.");
    expect(flat.breaks).toEqual([
      { offset: 24, kind: "paragraph" },
      { offset: 38, kind: "paragraph" },
    ]);
    expect(flat.text.slice(24)).toMatch(/^Peace to you\./);
    expect(flat.text.slice(38)).toBe("Greet the friends.");
  });

  it("reads a line break between two lines at the same indent as only a line break", () => {
    const flat = flattenInline(
      [
        { text: "So God created man in His own image;", poem: 1 },
        { text: "in the image of God He created him;", poem: 2 },
        { lineBreak: true },
        { text: "male and female He created them.", poem: 2 },
      ],
      notes,
    );
    expect(flat.text.split("\n")).toHaveLength(3);
    expect(flat.breaks).toEqual([]);
  });

  it("reads a line break between prose and poetry, or two indents, as a stanza break", () => {
    const flat = flattenInline(
      [
        "So the LORD God said to the serpent:",
        { lineBreak: true },
        { text: "“Because you have done this,", poem: 1 },
        { text: "cursed are you.", poem: 2 },
        { lineBreak: true },
        { text: "On your belly will you go.”", poem: 1 },
      ],
      notes,
    );
    expect(flat.breaks).toEqual([
      { offset: 37, kind: "paragraph" },
      { offset: 82, kind: "paragraph" },
    ]);
    expect(flat.text.slice(82)).toBe("On your belly will you go.”");
  });

  it("reports line breaks at the edges and the indent it starts and ends at", () => {
    expect(
      flattenInline([{ text: "A line.", poem: 1 }, { noteId: 1 }, { lineBreak: true }], notes),
    ).toEqual({
      text: "A line.",
      footnotes: [{ offset: 7, text: "first note" }],
      breaks: [],
      wordsOfJesus: [],
      firstLevel: 1,
      lastLevel: 1,
      leadingBreak: false,
      trailingBreak: true,
    });
    expect(
      flattenInline([{ lineBreak: true }, "Prose,", { text: "then poetry.", poem: 2 }], notes),
    ).toMatchObject({ firstLevel: 0, lastLevel: 2, leadingBreak: true, trailingBreak: false });
    expect(flattenInline([{ noteId: 1 }], notes).firstLevel).toBeUndefined();
  });

  it("marks the words of Jesus as a span of the plain text", () => {
    const flat = flattenInline(
      ["Jesus answered,", { text: "“Follow me.”", wordsOfJesus: true }, "And he rose."],
      notes,
    );
    expect(flat.text).toBe("Jesus answered, “Follow me.” And he rose.");
    expect(flat.wordsOfJesus).toEqual([{ start: 16, end: 28 }]);
    expect(flat.text.slice(16, 28)).toBe("“Follow me.”");
  });

  it("covers a whole verse, and joins pieces a note or a line break splits", () => {
    expect(
      flattenInline([{ text: "Most certainly I tell you.", wordsOfJesus: true }], notes).wordsOfJesus,
    ).toEqual([{ start: 0, end: 26 }]);

    const noted = flattenInline(
      [
        { text: "“Unless one is born anew,", wordsOfJesus: true },
        { noteId: 1 },
        { text: "he can’t see God’s Kingdom.”", wordsOfJesus: true },
      ],
      notes,
    );
    expect(noted.wordsOfJesus).toEqual([{ start: 0, end: noted.text.length }]);
    expect(noted.footnotes).toEqual([{ offset: 25, text: "first note" }]);

    const poem = flattenInline(
      [
        { text: "‘You shall love the Lord your God", poem: 1, wordsOfJesus: true },
        { text: "with all your heart.’", poem: 2, wordsOfJesus: true },
      ],
      notes,
    );
    expect(poem.text).toContain("\n");
    expect(poem.wordsOfJesus).toEqual([{ start: 0, end: poem.text.length }]);
  });

  it("keeps separate spans when the narrator speaks in between", () => {
    const flat = flattenInline(
      [
        { text: "“Simon,”", wordsOfJesus: true },
        "he said,",
        { text: "“do you love me?”", wordsOfJesus: true },
      ],
      notes,
    );
    expect(flat.wordsOfJesus.map(({ start, end }) => flat.text.slice(start, end))).toEqual([
      "“Simon,”",
      "“do you love me?”",
    ]);
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
        breaks: [],
        wordsOfJesus: [],
      },
      {
        verseId: 43_001_002,
        text: "He was with God in the beginning.",
        headings: [],
        footnotes: [],
        breaks: [],
        wordsOfJesus: [],
      },
      {
        verseId: 43_001_003,
        text: "Through Him all things were made.",
        headings: [{ kind: "section", text: "The Witness of John" }],
        footnotes: [],
        breaks: [],
        wordsOfJesus: [],
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
        breaks: [],
        wordsOfJesus: [],
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

  it("cleans up the KJV's note prefixes and turns its pilcrows into paragraphs when asked", () => {
    const source = translation("JHN", {
      number: 3,
      content: [
        {
          type: "verse",
          number: 16,
          content: [
            { text: "¶ For God so loved", wordsOfJesus: true },
            { noteId: 1 },
            { text: "the world.", wordsOfJesus: true },
          ],
        },
      ],
      footnotes: [{ noteId: 1, text: "3.16 loved: Gr. agapao" }],
    });
    expect(
      normalizeTranslation(source, {
        translationId: "kjv",
        stripFootnoteOrigin: true,
        pilcrowParagraphs: true,
      }),
    ).toEqual([
      {
        verseId: 43_003_016,
        text: "For God so loved the world.",
        headings: [],
        footnotes: [{ offset: 16, text: "loved: Gr. agapao" }],
        breaks: [{ offset: 0, kind: "paragraph" }],
        wordsOfJesus: [{ start: 0, end: 27 }],
      },
    ]);
    expect(normalizeTranslation(source, { translationId: "kjv" })[0]).toMatchObject({
      text: "¶ For God so loved the world.",
      footnotes: [{ offset: 18, text: "3.16 loved: Gr. agapao" }],
      breaks: [],
      wordsOfJesus: [{ start: 0, end: 29 }],
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

  const startsOf = (verses: { breaks: unknown[] }[]) => verses.map((verse) => verse.breaks);
  const paragraph = [{ offset: 0, kind: "paragraph" }];
  const line = [{ offset: 0, kind: "line" }];

  it("starts a paragraph at a line break between prose verses, mid-chapter", () => {
    const verses = normalizeTranslation(
      translation("JHN", {
        number: 3,
        content: [
          { type: "heading", content: ["Jesus and Nicodemus"] },
          { type: "verse", number: 1, content: ["Now there was a man of the Pharisees."] },
          { type: "verse", number: 2, content: ["He came to Jesus at night."] },
          { type: "line_break" },
          { type: "verse", number: 3, content: ["Jesus replied."] },
          { type: "verse", number: 4, content: ["Nicodemus asked."] },
          { type: "heading", content: ["John's Testimony"] },
          { type: "line_break" },
          { type: "verse", number: 5, content: ["After this."] },
          { type: "verse", number: 6, content: ["Flesh is born of flesh.", { lineBreak: true }] },
          { type: "verse", number: 7, content: ["Do not be amazed."] },
          { type: "verse", number: 8, content: [{ lineBreak: true }, "The wind blows."] },
        ],
      }),
      { translationId: "bsb" },
    );
    expect(startsOf(verses)).toEqual([
      // The chapter's first verse and an unmarked verse run on: no break stored.
      [], [], paragraph, [],
      // After a heading, with the source's own line break.
      paragraph, [],
      // A line break at the end of one verse or the start of the next.
      paragraph, paragraph,
    ]);
  });

  it("keeps a paragraph break that falls inside a verse", () => {
    const [verse] = normalizeTranslation(
      translation("3JN", {
        number: 1,
        content: [
          {
            type: "verse",
            number: 14,
            content: ["I hope to see you soon.", { noteId: 1 }, { lineBreak: true }, "Peace to you."],
          },
        ],
        footnotes: [{ noteId: 1, text: "Literally mouth to mouth" }],
      }),
      { translationId: "bsb" },
    );
    expect(verse.text).toBe("I hope to see you soon.\nPeace to you.");
    expect(verse.breaks).toEqual([{ offset: 24, kind: "paragraph" }]);
    expect(verse.footnotes).toEqual([{ offset: 23, text: "Literally mouth to mouth" }]);
  });

  it("tells a stanza break from a new line of poetry", () => {
    const couplet = (number: number, ...levels: number[]) => ({
      type: "verse" as const,
      number,
      content: levels.map((poem, i) => ({ text: `Line ${number}.${i}`, poem })),
    });
    const verses = normalizeTranslation(
      translation("PSA", {
        number: 2,
        content: [
          { type: "heading", content: ["The Triumphant Messiah"] },
          couplet(1, 1, 2),
          couplet(2, 1, 2),
          { type: "line_break" },
          couplet(3, 1, 2),
          couplet(4, 2),
          { type: "line_break" },
          couplet(5, 2),
          { type: "verse", number: 6, content: ["Then prose resumes."] },
          { type: "verse", number: 7, content: ["And runs on."] },
        ],
      }),
      { translationId: "bsb" },
    );
    expect(startsOf(verses)).toEqual([
      [],
      // The indent changes from 2 to 1: a new line of the same stanza.
      line,
      // A line break, then a change of indent: a new stanza.
      paragraph,
      // Verse 4 continues verse 3's last line: same indent, no break.
      [],
      // A line break between two lines at one indent only separates them.
      line,
      // Prose after poetry starts a line; prose after prose runs on.
      line,
      [],
    ]);
  });

  it("gives each one-line verse of a KJV psalm its own line", () => {
    const verses = normalizeTranslation(
      translation("PSA", {
        number: 117,
        content: [
          { type: "verse", number: 1, content: [{ text: "O praise the LORD.", poem: 1 }, { lineBreak: true }] },
          { type: "verse", number: 2, content: [{ text: "Praise ye the LORD.", poem: 1 }, { lineBreak: true }] },
        ],
      }),
      { translationId: "kjv", pilcrowParagraphs: true },
    );
    expect(startsOf(verses)).toEqual([[], line]);
  });

  it("carries red-letter spans verse by verse through a speech", () => {
    const verses = normalizeTranslation(
      translation("JHN", {
        number: 3,
        content: [
          {
            type: "verse",
            number: 10,
            content: ["Jesus answered him,", { text: "“Are you the teacher of Israel?", wordsOfJesus: true }],
          },
          { type: "verse", number: 11, content: [{ text: "Most certainly I tell you.", wordsOfJesus: true }] },
          { type: "verse", number: 12, content: [{ text: "If I told you earthly things.”", wordsOfJesus: true }] },
          { type: "verse", number: 13, content: ["No one has ascended into heaven."] },
        ],
      }),
      { translationId: "web" },
    );
    expect(verses.map((verse) => verse.wordsOfJesus)).toEqual([
      [{ start: 20, end: 51 }],
      [{ start: 0, end: 26 }],
      [{ start: 0, end: 30 }],
      [],
    ]);
    expect(verses[0].text.slice(20, 51)).toBe("“Are you the teacher of Israel?");
    for (const verse of verses.slice(1, 3)) {
      expect(verse.wordsOfJesus[0].end).toBe(verse.text.length);
    }
  });
});
