import { describe, expect, it, vi } from "vitest";

import { slashItems, typedPassage, type BlockContext } from "./blocks";

const translations = [
  { id: "bsb", abbrev: "BSB", name: "Berean Standard Bible", attribution: "", sourceUrl: "" },
  { id: "kjv", abbrev: "KJV", name: "King James Version", attribution: "", sourceUrl: "" },
];

const context = (changes: Partial<BlockContext> = {}): BlockContext => ({
  passages: true,
  translations,
  translation: () => translations[0],
  promptImage: vi.fn(),
  lookUp: vi.fn(),
  ...changes,
});

const ids = (query: string, changes?: Partial<BlockContext>) => slashItems(query, context(changes)).map((item) => item.id);

describe("typedPassage", () => {
  it("reads a reference typed after the slash, with a translation or not", () => {
    expect(typedPassage("jn 3.16-18", translations)).toEqual({ reference: "John 3:16-18" });
    expect(typedPassage("ps 23 kjv", translations)).toEqual({ reference: "Psalm 23", translation: translations[1] });
    expect(typedPassage("Romans 8:1 | KJV", translations)).toBeUndefined();
  });

  it("wants a chapter at least, so that a word is not taken for a book", () => {
    expect(typedPassage("ps", translations)).toBeUndefined();
    expect(typedPassage("heading", translations)).toBeUndefined();
    expect(typedPassage("", translations)).toBeUndefined();
  });
});

describe("slashItems", () => {
  it("lists every block for a bare slash, passages first", () => {
    expect(ids("")).toEqual([
      "passage",
      "heading",
      "subheading",
      "bullet-list",
      "ordered-list",
      "quote",
      "separator",
      "image",
    ]);
  });

  it("narrows the list to what is typed", () => {
    expect(ids("head")).toEqual(["heading", "subheading"]);
    expect(ids("list")).toEqual(["bullet-list", "ordered-list"]);
    expect(ids("hr")).toEqual(["separator"]);
    expect(ids("nothing like it")).toEqual([]);
  });

  it("offers a typed reference as a passage, in the translation being read unless one is named", () => {
    const [first, second] = slashItems("john 3:16", context({ translation: () => translations[1] }));
    expect(first).toMatchObject({ id: "passage-reference", label: "Passage: John 3:16", hint: "KJV" });
    expect(second.id).toBe("passage");
    expect(slashItems("ps 23 bsb", context({ translation: () => translations[1] }))[0]).toMatchObject({
      label: "Passage: Psalm 23",
      hint: "BSB",
    });
  });

  it("offers no passages where they cannot go: in a note", () => {
    expect(ids("", { passages: false })).not.toContain("passage");
    expect(ids("john 3:16", { passages: false })).toEqual([]);
  });
});
