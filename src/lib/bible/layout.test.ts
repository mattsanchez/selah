import { describe, expect, it } from "vitest";

import { readFixture } from "./import/fixture";
import {
  layoutParallel,
  layoutPassage,
  noteMarker,
  paragraphLines,
  type Block,
  type Inline,
  type VersePart,
} from "./layout";
import type { VerseRecord } from "./types";

const verse = (verseId: number, text: string, rest: Partial<VerseRecord> = {}): VerseRecord => ({
  verseId,
  text,
  headings: [],
  footnotes: [],
  breaks: [],
  wordsOfJesus: [],
  ...rest,
});

type Paragraph = Extract<Block, { type: "paragraph" }>;
const paragraphs = (blocks: Block[]) =>
  blocks.filter((block): block is Paragraph => block.type === "paragraph");

// Inlines as a string: red-letter text in [brackets], note markers in {braces}.
const show = (inlines: Inline[]) =>
  inlines
    .map((inline) =>
      inline.type === "note"
        ? `{${inline.note.marker}}`
        : inline.wordsOfJesus
          ? `[${inline.text}]`
          : inline.text,
    )
    .join("");

// A paragraph as a string: each verse opens with its number in (parentheses),
// "/" marks a new line and " " a verse that runs on.
const showParts = (parts: VersePart[]) =>
  parts
    .map(
      (part) =>
        (part.join === "line" ? "/" : part.join === "inline" ? " " : "") +
        (part.number === undefined ? "" : `(${part.number})`) +
        show(part.inlines),
    )
    .join("");

const showBlocks = (blocks: Block[]) =>
  blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return showParts(block.parts);
      case "heading":
        return `${block.kind}: ${show(block.inlines)}`;
      case "chapter":
        return `chapter: ${block.label}`;
      case "gap":
        return "gap";
    }
  });

async function fixture(translationId: string, start: number, end: number = start) {
  const verses = await readFixture(translationId);
  return verses.filter((item) => item.verseId >= start && item.verseId <= end);
}

describe("noteMarker", () => {
  it("counts in letters", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(noteMarker)).toEqual([
      "a",
      "b",
      "z",
      "aa",
      "ab",
      "az",
      "ba",
      "zz",
      "aaa",
    ]);
  });
});

describe("layoutPassage", () => {
  it("runs verses on in one paragraph unless a break says otherwise", () => {
    const { blocks } = layoutPassage([
      [
        verse(43003016, "Sixteen.", { breaks: [{ offset: 0, kind: "paragraph" }] }),
        verse(43003017, "Seventeen."),
        verse(43003018, "Eighteen."),
        verse(43003019, "Nineteen.", { breaks: [{ offset: 0, kind: "paragraph" }] }),
        verse(43003020, "Twenty."),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(16)Sixteen. (17)Seventeen. (18)Eighteen.",
      "(19)Nineteen. (20)Twenty.",
    ]);
  });

  it("starts a block at the first verse of a passage, of a chapter, and after headings", () => {
    const { blocks } = layoutPassage([
      [
        // No stored break on any of these.
        verse(43003035, "Thirty-five."),
        verse(43003036, "Thirty-six."),
        verse(43004001, "One."),
        verse(43004002, "Two."),
        verse(43004003, "Three.", { headings: [{ kind: "section", text: "A Heading" }] }),
        verse(43004004, "Four."),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "chapter: John 3",
      "(35)Thirty-five. (36)Thirty-six.",
      "chapter: John 4",
      "(1)One. (2)Two.",
      "section: A Heading",
      "(3)Three. (4)Four.",
    ]);
  });

  it("labels chapters only when the passage has more than one, unless told", () => {
    const one = [[verse(43003016, "Sixteen."), verse(43003017, "Seventeen.")]];
    expect(showBlocks(layoutPassage(one).blocks)).toEqual(["(16)Sixteen. (17)Seventeen."]);
    expect(showBlocks(layoutPassage(one, { chapters: true }).blocks)).toEqual([
      "chapter: John 3",
      "(16)Sixteen. (17)Seventeen.",
    ]);

    const two = [[verse(19023006, "Six.")], [verse(19024001, "One.")]];
    expect(showBlocks(layoutPassage(two).blocks)).toEqual([
      "chapter: Psalm 23",
      "(6)Six.",
      "gap",
      "chapter: Psalm 24",
      "(1)One.",
    ]);
    expect(showBlocks(layoutPassage(two, { chapters: false }).blocks)).toEqual([
      "(6)Six.",
      "gap",
      "(1)One.",
    ]);
  });

  it("starts a new line at a line break, keeping the lines inside a verse", () => {
    const { blocks } = layoutPassage([
      [
        verse(19023001, "Line one;\nline two."),
        verse(19023002, "Line three;\nline four.", { breaks: [{ offset: 0, kind: "line" }] }),
        verse(19023003, "A new stanza.", { breaks: [{ offset: 0, kind: "paragraph" }] }),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(1)Line one;\nline two./(2)Line three;\nline four.",
      "(3)A new stanza.",
    ]);
  });

  it("splits a verse at a paragraph break inside it", () => {
    const text = "End of one stanza.\nStart of the next,\nand more.";
    const { blocks, notes } = layoutPassage([
      [
        verse(19018011, "Before."),
        verse(19018012, text, {
          breaks: [
            { offset: 0, kind: "line" },
            { offset: 19, kind: "paragraph" },
          ],
          footnotes: [
            { offset: 18, text: "At the end of the first part." },
            { offset: 19, text: "At the start of the second part." },
          ],
        }),
        verse(19018013, "After.", { breaks: [{ offset: 0, kind: "line" }] }),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(11)Before./(12)End of one stanza.{a}",
      "{b}Start of the next,\nand more./(13)After.",
    ]);
    // The number is printed once; both parts carry the verse id.
    const [first, second] = paragraphs(blocks);
    expect(first.parts[1]).toMatchObject({ verseId: 19018012, number: 12 });
    expect(second.parts[0].verseId).toBe(19018012);
    expect(second.parts[0].number).toBeUndefined();
    expect(notes.map((note) => note.marker)).toEqual(["a", "b"]);
  });

  it("splits a verse of prose at a paragraph break, with a note or red-letter text across it", () => {
    const { blocks } = layoutPassage([
      [
        verse(43001038, "He said, “Come.”\nThey came. He said, “Stay,\nand see.”", {
          breaks: [
            { offset: 0, kind: "paragraph" },
            { offset: 17, kind: "paragraph" },
            { offset: 44, kind: "paragraph" },
          ],
          // The note sits before the line break the first paragraph ends on.
          footnotes: [{ offset: 16, text: "A note." }],
          wordsOfJesus: [
            { start: 9, end: 16 },
            { start: 37, end: 53 },
          ],
        }),
        verse(43001039, "The next verse runs on."),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(38)He said, [“Come.”]{a}",
      "They came. He said, [“Stay,]",
      "[and see.”] (39)The next verse runs on.",
    ]);
    for (const block of paragraphs(blocks)) expect(paragraphLines(block.parts)).toHaveLength(1);
  });

  it("prints sections and superscriptions before the verse, subscriptions after", () => {
    const { blocks } = layoutPassage([
      [
        verse(45016026, "Twenty-six."),
        verse(45016027, "Twenty-seven.", {
          headings: [
            { kind: "subscription", text: "Written to the Romans." },
            { kind: "section", text: "Doxology" },
          ],
        }),
      ],
      [
        verse(19003001, "One.", {
          headings: [
            { kind: "section", text: "Deliver Me, O LORD!" },
            { kind: "superscription", text: "A Psalm of David." },
          ],
        }),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "chapter: Romans 16",
      "(26)Twenty-six.",
      "section: Doxology",
      "(27)Twenty-seven.",
      "subscription: Written to the Romans.",
      "gap",
      "chapter: Psalm 3",
      "section: Deliver Me, O LORD!",
      "superscription: A Psalm of David.",
      "(1)One.",
    ]);
  });

  it("starts a new block after a subscription", () => {
    const { blocks } = layoutPassage([
      [
        verse(45016026, "Twenty-six.", {
          headings: [{ kind: "subscription", text: "A closing note." }],
        }),
        verse(45016027, "Twenty-seven."),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(26)Twenty-six.",
      "subscription: A closing note.",
      "(27)Twenty-seven.",
    ]);
  });

  it("places footnote markers at their offsets and numbers them in reading order", () => {
    const { blocks, notes } = layoutPassage([
      [
        verse(43001001, "In the beginning was the Word.", {
          headings: [
            {
              kind: "section",
              text: "The Beginning",
              footnotes: [{ offset: 13, text: "On the heading." }],
            },
          ],
          footnotes: [
            { offset: 0, text: "At the start." },
            { offset: 16, text: "After beginning." },
            { offset: 16, text: "Also after beginning." },
            { offset: 30, text: "At the end." },
          ],
        }),
        verse(43001002, "He was with God.", { footnotes: [{ offset: 99, text: "Past the end." }] }),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "section: The Beginning{a}",
      "(1){b}In the beginning{c}{d} was the Word.{e} (2)He was with God.{f}",
    ]);
    expect(notes).toEqual([
      { index: 0, marker: "a", text: "On the heading.", verseId: 43001001 },
      { index: 1, marker: "b", text: "At the start.", verseId: 43001001 },
      { index: 2, marker: "c", text: "After beginning.", verseId: 43001001 },
      { index: 3, marker: "d", text: "Also after beginning.", verseId: 43001001 },
      { index: 4, marker: "e", text: "At the end.", verseId: 43001001 },
      { index: 5, marker: "f", text: "Past the end.", verseId: 43001002 },
    ]);
  });

  it("marks the words of Jesus, with footnotes inside a span", () => {
    const text = "Jesus answered, “Truly, truly, I tell you.” Then he left.";
    const { blocks } = layoutPassage([
      [
        verse(43003003, text, {
          wordsOfJesus: [{ start: 16, end: 43 }],
          footnotes: [{ offset: 30, text: "Or Amen, amen" }],
        }),
        verse(43003004, "All of it.", { wordsOfJesus: [{ start: 0, end: 10 }] }),
        verse(43003005, "Two spans here.", {
          wordsOfJesus: [
            { start: 0, end: 3 },
            { start: 10, end: 15 },
          ],
        }),
      ],
    ]);
    expect(showBlocks(blocks)).toEqual([
      "(3)Jesus answered, [“Truly, truly,]{a}[ I tell you.”] Then he left. " +
        "(4)[All of it.] (5)[Two] spans [here.]",
    ]);
  });

  it("puts a gap between ranges and skips a range with no verses", () => {
    const { blocks } = layoutPassage([
      [verse(43003016, "Sixteen."), verse(43003017, "Seventeen.")],
      [],
      [verse(43003022, "Twenty-two.")],
    ]);
    expect(showBlocks(blocks)).toEqual(["(16)Sixteen. (17)Seventeen.", "gap", "(22)Twenty-two."]);
    expect(layoutPassage([]).blocks).toEqual([]);
    expect(layoutPassage([[], []]).blocks).toEqual([]);
  });

  it("numbers on from notes it is given", () => {
    const first = layoutPassage([
      [verse(43003016, "Sixteen.", { footnotes: [{ offset: 8, text: "One." }] })],
    ]);
    const second = layoutPassage(
      [[verse(43003017, "Seventeen.", { footnotes: [{ offset: 0, text: "Two." }] })]],
      { notes: first.notes },
    );
    expect(second.notes).toBe(first.notes);
    expect(second.notes.map((note) => note.marker)).toEqual(["a", "b"]);
    expect(showBlocks(second.blocks)).toEqual(["(17){b}Seventeen."]);
  });

  it("rejects a verse id that is not canonical", () => {
    expect(() => layoutPassage([[verse(43003099, "No such verse.")]])).toThrow(RangeError);
  });

  describe("with the fixture", () => {
    it("lays out John 3:16-21 in the BSB as two paragraphs with two footnotes", async () => {
      const { blocks, notes } = layoutPassage([await fixture("bsb", 43003016, 43003021)]);
      const text = showBlocks(blocks);
      expect(text).toHaveLength(2);
      // Jesus is speaking throughout, so every verse is red.
      expect(text[0]).toMatch(/^\(16\)\[For God so loved the world .*one and only\]\{a\}\[ Son/);
      expect(text[0]).toContain(" (17)[For God did not send His Son");
      expect(text[1]).toMatch(/^\(19\)\[And this is the verdict: .* \(20\).* \(21\).*in God\.”\]\{b\}$/);
      expect(notes.map((note) => note.verseId)).toEqual([43003016, 43003021]);
    });

    it("lays out Psalm 23 in the BSB with its heading, title, stanzas and lines", async () => {
      const { blocks, notes } = layoutPassage([await fixture("bsb", 19023001, 19023006)]);
      const text = showBlocks(blocks);
      expect(text.slice(0, 2)).toEqual([
        "section: The LORD Is My Shepherd",
        "superscription: A Psalm of David.",
      ]);
      expect(text).toHaveLength(4);
      expect(text[2]).toMatch(
        /^\(1\)The LORD is my shepherd;\{a\}\nI shall not want\.\/\(2\)He makes me lie down/,
      );
      expect(text[3]).toMatch(/^\(5\)You prepare a table before me\n.*\/\(6\)Surely goodness/s);
      expect(notes).toHaveLength(3);
    });

    it("marks John 3:16 red in all three translations, and not John 3:1", async () => {
      const red = async (translationId: string, verseId: number) => {
        const { blocks } = layoutPassage([await fixture(translationId, verseId)]);
        return paragraphs(blocks)
          .flatMap((block) => block.parts.flatMap((part) => part.inlines))
          .some((inline) => inline.type === "text" && inline.wordsOfJesus);
      };
      for (const translationId of ["bsb", "web", "kjv"]) {
        expect(await red(translationId, 43003016)).toBe(true);
        expect(await red(translationId, 43003001)).toBe(false);
      }
    });

    it("starts a paragraph at each change of speaker inside WEB John 1:21", async () => {
      const { blocks } = layoutPassage([await fixture("web", 43001020, 43001022)]);
      expect(showBlocks(blocks)).toEqual([
        "(20)He declared, and didn’t deny, but he declared, “I am not the Christ.”",
        "(21)They asked him, “What then? Are you Elijah?”",
        "He said, “I am not.”",
        "“Are you the prophet?”",
        "He answered, “No.”",
        "(22)They said therefore to him, “Who are you? Give us an answer to take back to those who sent us. What do you say about yourself?”",
      ]);
      // Each is one line of prose.
      for (const block of paragraphs(blocks)) expect(paragraphLines(block.parts)).toHaveLength(1);
    });

    it("keeps the red-letter text of a verse in place after a paragraph break inside it", async () => {
      // WEB John 4:17: the woman answers, then Jesus.
      const { blocks } = layoutPassage([await fixture("web", 43004017)]);
      expect(showBlocks(blocks)).toEqual([
        "(17)The woman answered, “I have no husband.”",
        "Jesus said to her, [“You said well, ‘I have no husband,’]",
      ]);
    });

    it("prints the KJV's subscription after Romans 16:27", async () => {
      const { blocks } = layoutPassage([await fixture("kjv", 45016027)]);
      expect(showBlocks(blocks).at(-1)).toMatch(/^subscription: Written to the Romans/);
    });

    it("runs on past a verse the translation leaves out", async () => {
      // The BSB has no John 5:4.
      const verses = await fixture("bsb", 43005003, 43005005);
      expect(verses.map((item) => item.verseId)).toEqual([43005003, 43005005]);
      const numbers = paragraphs(layoutPassage([verses]).blocks).flatMap((block) =>
        block.parts.map((part) => part.number),
      );
      expect(numbers).toEqual([3, 5]);
    });

    it("lays out every verse of every translation, keeping all the text and notes", async () => {
      for (const translationId of ["bsb", "web", "kjv"]) {
        const verses = await readFixture(translationId);
        const { blocks, notes } = layoutPassage([verses]);

        const printed = new Map<number, string>();
        for (const block of paragraphs(blocks)) {
          for (const part of block.parts) {
            const text = part.inlines
              .map((inline) => (inline.type === "text" ? inline.text : ""))
              .join("");
            printed.set(part.verseId, [printed.get(part.verseId), text].filter(Boolean).join("\n"));
          }
        }
        for (const item of verses) {
          expect(printed.get(item.verseId), `${translationId} ${item.verseId}`).toBe(item.text);
        }

        const expected = verses.reduce(
          (count, item) =>
            count +
            item.footnotes.length +
            item.headings.reduce((sum, heading) => sum + (heading.footnotes?.length ?? 0), 0),
          0,
        );
        expect(notes, translationId).toHaveLength(expected);
      }
    });
  });
});

describe("paragraphLines", () => {
  const lines = (verses: VerseRecord[]) =>
    paragraphs(layoutPassage([verses]).blocks).map((block) =>
      paragraphLines(block.parts).map(showParts),
    );

  it("keeps prose on one line", () => {
    expect(lines([verse(43003016, "Sixteen."), verse(43003017, "Seventeen.")])).toEqual([
      ["(16)Sixteen. (17)Seventeen."],
    ]);
  });

  it("gives each line of poetry its own line, numbering a verse once", () => {
    expect(
      lines([
        verse(19023001, "Line one;\nline two.", { footnotes: [{ offset: 9, text: "A note." }] }),
        verse(19023002, "Line three;\nline four.", { breaks: [{ offset: 0, kind: "line" }] }),
        verse(19023003, "Runs on."),
      ]),
    ).toEqual([["(1)Line one;{a}", "line two.", "(2)Line three;", "line four. (3)Runs on."]]);
  });

  it("keeps the verse id on every line of a verse", () => {
    const [block] = paragraphs(layoutPassage([[verse(19023001, "One;\ntwo;\nthree.")]]).blocks);
    expect(
      paragraphLines(block.parts).map((line) => line.map((part) => part.verseId)),
    ).toEqual([[19023001], [19023001], [19023001]]);
  });
});

describe("layoutParallel", () => {
  it("gives every verse a row, with an empty cell where a translation lacks it", async () => {
    const range = [43005003, 43005005] as const;
    const { rows } = layoutParallel([
      [await fixture("bsb", ...range)],
      [await fixture("kjv", ...range)],
    ]);
    expect(rows.map((row) => (row.type === "verse" ? row.number : row.type))).toEqual([3, 4, 5]);
    const present = rows.map((row) => row.type === "verse" && row.cells.map((cell) => cell !== null));
    expect(present).toEqual([
      [true, true],
      [false, true],
      [true, true],
    ]);
  });

  it("numbers each translation's footnotes separately", async () => {
    const { rows, notes } = layoutParallel([
      [await fixture("bsb", 43003016, 43003021)],
      [await fixture("web", 43003016, 43003021)],
      [await fixture("kjv", 43003016, 43003021)],
    ]);
    expect(rows).toHaveLength(6);
    expect(notes.map((list) => list.map((note) => note.marker))).toEqual([["a", "b"], ["a"], []]);
  });

  it("starts a paragraph inside a cell where one starts inside the verse", async () => {
    const { rows } = layoutParallel([
      [await fixture("web", 43001021)],
      [await fixture("kjv", 43001021)],
    ]);
    const [row] = rows;
    if (row.type !== "verse") throw new Error("expected a verse row");
    expect(row.cells.map((cell) => showBlocks(cell!))).toEqual([
      [
        "(21)They asked him, “What then? Are you Elijah?”",
        "He said, “I am not.”",
        "“Are you the prophet?”",
        "He answered, “No.”",
      ],
      [
        "(21)And they asked him, What then? Art thou Elias? And he saith, I am not. Art thou that prophet? And he answered, No.",
      ],
    ]);
  });

  it("keeps a verse's headings in its cell", () => {
    const { rows } = layoutParallel([
      [[verse(19023001, "One.", { headings: [{ kind: "section", text: "A Heading" }] })]],
      [[verse(19023001, "Uno.")]],
    ]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.type === "verse" && row.cells.map((cell) => cell && showBlocks(cell))).toEqual([
      ["section: A Heading", "(1)One."],
      ["(1)Uno."],
    ]);
  });

  it("labels chapters and separates ranges", () => {
    const { rows } = layoutParallel([
      [[verse(43003036, "a")], [verse(43004001, "b"), verse(43004002, "c")]],
      [[verse(43003036, "x")], [verse(43004002, "z")]],
    ]);
    expect(
      rows.map((row) =>
        row.type === "verse" ? row.verseId : row.type === "chapter" ? row.label : "gap",
      ),
    ).toEqual(["John 3", 43003036, "gap", "John 4", 43004001, 43004002]);
  });

  it("has no rows when no translation has the passage", () => {
    expect(layoutParallel([[[]], [[]]]).rows).toEqual([]);
    expect(layoutParallel([]).rows).toEqual([]);
  });
});
