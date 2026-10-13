import { describe, expect, it } from "vitest";

import { documentPassages, findTranslation, parseDocument, passageCard } from "./cards";

const translations = [
  { id: "bsb", abbrev: "BSB" },
  { id: "kjv", abbrev: "KJV" },
];

describe("parseDocument", () => {
  it("splits a document into its Markdown and its cards, in order", () => {
    const segments = parseDocument(
      ["# Light", "", "[[John 1:1-5]]", "", "The Word *was* God.", "[[Psalm 23 | KJV]]  ", "Amen."].join(
        "\n",
      ),
    );
    expect(segments).toEqual([
      { type: "markdown", text: "# Light\n" },
      {
        type: "card",
        source: "[[John 1:1-5]]",
        reference: "John 1:1-5",
        translation: undefined,
        ranges: [{ start: 43001001, end: 43001005 }],
      },
      { type: "markdown", text: "\nThe Word *was* God." },
      {
        type: "card",
        source: "[[Psalm 23 | KJV]]",
        reference: "Psalm 23",
        translation: "KJV",
        ranges: [{ start: 19023001, end: 19023006 }],
      },
      { type: "markdown", text: "Amen." },
    ]);
  });

  it("reads any reference the reader's box takes, and normalizes its verses", () => {
    const [card] = parseDocument("[[jn 3.18, 16-17; 4:1-3|web]]");
    expect(card).toMatchObject({
      type: "card",
      translation: "web",
      ranges: [
        { start: 43003016, end: 43003018 },
        { start: 43004001, end: 43004003 },
      ],
    });
  });

  it("is a card only on a line of its own, at the margin", () => {
    for (const text of [
      "See [[John 3:16]] for more.",
      "  [[John 3:16]]",
      "[[John 3:16]] and so on",
      "> [[John 3:16]]",
      "[[]]",
      "[[John 3:16]",
    ]) {
      expect(parseDocument(text)).toEqual([{ type: "markdown", text }]);
    }
  });

  it("leaves a card inside a fenced code block as code", () => {
    const text = ["```", "[[John 3:16]]", "```", "~~~~md", "[[John 3:17]]", "~~~", "~~~~"].join("\n");
    expect(parseDocument(text)).toEqual([{ type: "markdown", text }]);
    // A fence that is never closed runs to the end.
    expect(parseDocument("```\n[[John 3:16]]")).toHaveLength(1);
    // After the block closes, cards are cards again.
    expect(parseDocument("```\ncode\n```\n[[John 3:16]]").map((segment) => segment.type)).toEqual([
      "markdown",
      "card",
    ]);
  });

  it("keeps a card whose reference does not parse, with the reason", () => {
    const [card] = parseDocument("[[John 99:1]]");
    expect(card).toMatchObject({ type: "card", source: "[[John 99:1]]", reference: "John 99:1" });
    expect(card).not.toHaveProperty("ranges");
    expect((card as { error?: string }).error).toMatch(/John/);
  });

  it("reads Windows line endings, and nothing from nothing", () => {
    expect(parseDocument("a\r\n[[John 3:16]]\r\nb").map((segment) => segment.type)).toEqual([
      "markdown",
      "card",
      "markdown",
    ]);
    expect(parseDocument("")).toEqual([]);
    expect(parseDocument("\n \n")).toEqual([]);
  });
});

describe("passageCard", () => {
  it("writes a card that reads back as the same verses", () => {
    const ranges = [
      { start: 43001003, end: 43001003 },
      { start: 43001001, end: 43001001 },
    ];
    const line = passageCard(ranges, "KJV");
    expect(line).toBe("[[John 1:1, 3 | KJV]]");
    expect(parseDocument(line)[0]).toMatchObject({
      translation: "KJV",
      ranges: [
        { start: 43001001, end: 43001001 },
        { start: 43001003, end: 43001003 },
      ],
    });
    expect(passageCard([{ start: 45008028, end: 45008030 }])).toBe("[[Romans 8:28-30]]");
  });
});

describe("findTranslation", () => {
  it("finds a loaded translation by abbreviation or id, whatever the case", () => {
    expect(findTranslation("kjv", translations)?.id).toBe("kjv");
    expect(findTranslation(" KJV ", translations)?.id).toBe("kjv");
    expect(findTranslation("ESV", translations)).toBeUndefined();
    expect(findTranslation(undefined, translations)).toBeUndefined();
  });
});

describe("documentPassages", () => {
  it("is the verses of every card: what item_passage holds", () => {
    const markdown = ["[[Romans 8:28-30 | KJV]]", "", "Some thoughts.", "", "[[John 3:16]]"].join("\n");
    expect(documentPassages(markdown, translations)).toEqual([
      { start: 43003016, end: 43003016, translationId: null },
      { start: 45008028, end: 45008030, translationId: "kjv" },
    ]);
  });

  it("follows the document: a card added, changed or removed", () => {
    const one = "[[John 3:16]]\n\nText.";
    expect(documentPassages(one, translations)).toHaveLength(1);
    expect(documentPassages(`${one}\n\n[[Psalm 1:1-2]]`, translations)).toEqual([
      { start: 19001001, end: 19001002, translationId: null },
      { start: 43003016, end: 43003016, translationId: null },
    ]);
    expect(documentPassages(one.replace("3:16", "3:17"), translations)).toEqual([
      { start: 43003017, end: 43003017, translationId: null },
    ]);
    expect(documentPassages("Text.", translations)).toEqual([]);
  });

  it("joins cards that overlap or touch into one range, with the first card's translation", () => {
    const markdown = "[[John 3:16-18 | BSB]]\n[[John 3:17-21 | KJV]]\n[[John 3:22]]\n[[John 3:16-18]]";
    expect(documentPassages(markdown, translations)).toEqual([
      { start: 43003016, end: 43003022, translationId: "bsb" },
    ]);
  });

  it("ignores cards that do not parse, cards in code, and translations that are not loaded", () => {
    const markdown = "[[Nowhere 1:1]]\n```\n[[John 3:16]]\n```\n[[John 1:1 | ESV]]";
    expect(documentPassages(markdown, translations)).toEqual([
      { start: 43001001, end: 43001001, translationId: null },
    ]);
  });
});
