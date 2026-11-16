import { describe, expect, it } from "vitest";

import type { Item } from "@/lib/items/queries";

import {
  decodeSegment,
  feedPath,
  homePath,
  itemHeadline,
  itemKey,
  itemLinkTarget,
  itemSlug,
  itemSummary,
  keyIdRange,
  parsePage,
  parsePassage,
  parsePermalink,
  passagePath,
  permalinkPath,
  tagPath,
} from "./public-url";

const ID = "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b";

const item = (values: Partial<Item>): Item => ({
  id: ID,
  kind: "note",
  title: null,
  markdown: null,
  note: null,
  color: null,
  visibility: "public",
  publishedAt: new Date("2026-10-18T09:00:00Z"),
  createdAt: new Date("2026-10-18T09:00:00Z"),
  updatedAt: new Date("2026-10-18T09:00:00Z"),
  passages: [],
  tags: [],
  ...values,
});

describe("permalinks", () => {
  it("key an item by the first twelve hex digits of its id", () => {
    expect(itemKey(ID)).toBe("3f9a2c1b7d4e");
    expect(keyIdRange("3f9a2c1b7d4e")).toEqual({
      from: "3f9a2c1b-7d4e-0000-0000-000000000000",
      to: "3f9a2c1b-7d4e-ffff-ffff-ffffffffffff",
    });
  });

  it("name a reflection by its title", () => {
    const reflection = item({
      kind: "reflection",
      title: "No condemnation!",
      markdown: "Text.",
    });
    expect(itemHeadline(reflection)).toBe("No condemnation!");
    expect(permalinkPath(reflection)).toBe("/p/no-condemnation-3f9a2c1b7d4e");
  });

  it("name a highlight by its reference", () => {
    const highlight = item({
      kind: "highlight",
      color: "yellow",
      note: "The one I come back to",
      passages: [{ start: 45008038, end: 45008039, translationId: "bsb" }],
    });
    expect(itemHeadline(highlight)).toBe("Romans 8:38-39");
    expect(itemSummary(highlight)).toBe("The one I come back to");
    expect(permalinkPath(highlight)).toBe("/p/romans-8-38-39-3f9a2c1b7d4e");
  });

  it("name a note, and an untitled reflection, by their first words, without cards", () => {
    const note = item({ markdown: "Be **still**. That is the whole of it." });
    expect(itemHeadline(note)).toBe("Be still. That is the whole of it.");
    expect(itemSlug(note)).toBe("be-still-that-is-the-whole-of-it");
    const untitled = item({
      kind: "reflection",
      markdown: "[[Romans 8:1]]\n\nNo condemnation now.",
    });
    expect(itemHeadline(untitled)).toBe("No condemnation now.");
  });

  it("cut a long slug between words", () => {
    const long = item({ kind: "reflection", title: "word ".repeat(30) });
    expect(itemSlug(long).length).toBeLessThanOrEqual(60);
    expect(itemSlug(long)).toMatch(/^(word-)+word$/);
  });

  it("are the key alone when there is nothing to name the item by", () => {
    expect(permalinkPath(item({ markdown: "🙏" }))).toBe("/p/3f9a2c1b7d4e");
    expect(itemHeadline(item({}))).toBe("Note");
  });

  it("keep letters of any script, encoded", () => {
    const path = permalinkPath(
      item({ kind: "reflection", title: "Благодать для всех" }),
    );
    expect(path).toBe(
      `/p/${encodeURIComponent("благодать-для-всех")}-3f9a2c1b7d4e`,
    );
    expect(parsePermalink(decodeSegment(path.slice(3)))).toEqual({
      key: "3f9a2c1b7d4e",
      slug: "благодать-для-всех",
    });
  });

  it("read back the key and the slug before it", () => {
    expect(parsePermalink("no-condemnation-3f9a2c1b7d4e")).toEqual({
      key: "3f9a2c1b7d4e",
      slug: "no-condemnation",
    });
    expect(parsePermalink("3F9A2C1B7D4E")).toEqual({
      key: "3f9a2c1b7d4e",
      slug: "",
    });
    expect(parsePermalink("no-condemnation")).toBeUndefined();
    expect(parsePermalink("3f9a2c1b7d4")).toBeUndefined();
    expect(parsePermalink("x-3f9a2c1b7d4e0")).toBeUndefined();
  });
});

describe("a blockquote", () => {
  const credit =
    "> — Adapted from [Tyndale Open Study Notes](https://tyndaleopenresources.com/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).";
  const quote = `> The words of the note.\n>\n${credit}`;

  const unseen = (markdown: string, ...words: string[]) => {
    for (const post of [
      item({ kind: "reflection", title: "T", markdown }),
      item({ kind: "reflection", markdown }),
      item({ kind: "note", markdown }),
    ]) {
      for (const text of [
        itemSummary(post),
        itemSummary(post, 40),
        itemHeadline(post),
        permalinkPath(post),
      ]) {
        for (const word of words)
          expect(text.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  };

  it("stays out of a description and the name of an untitled post", () => {
    expect(
      itemSummary(
        item({
          kind: "reflection",
          title: "T",
          markdown: `${quote}\n\nMy own words.`,
        }),
      ),
    ).toBe("My own words.");
    expect(
      itemHeadline(
        item({ kind: "reflection", markdown: `${quote}\n\nMy own words.` }),
      ),
    ).toBe("My own words.");
  });

  it("stays out when the credit was deleted", () => {
    unseen("Mine.\n\n> The words of the note.", "words of the note");
    expect(
      itemSummary(item({ markdown: "Mine.\n\n> The words of the note." })),
    ).toBe("Mine.");
  });

  it("stays out when the credit was reworded, or the quote was split from it", () => {
    unseen(
      "> The words of the note.\n>\n> Tyndale notes\n\nMine.",
      "words of the note",
      "tyndale",
    );
    unseen(
      "> The words of the note.\n\n> — Adapted from Tyndale\n\nMine.",
      "words of the note",
      "tyndale",
    );
    unseen(
      "> The words of the note.\n\n\n> Tyndale Open Study Notes\n\nMine.",
      "words of the note",
      "tyndale",
    );
  });

  it("stays out when it is one of anyone's, not only a share-alike source's", () => {
    unseen("> Matthew Henry wrote this.\n\nMine.", "henry");
    expect(
      itemSummary(item({ markdown: "> Matthew Henry wrote this.\n\nMine." })),
    ).toBe("Mine.");
  });

  it("stays out when nested, multiline, lazy, or in a list", () => {
    unseen(
      "> outer words\n>\n> > inner words\n> more outer\n\nMine.",
      "outer",
      "inner",
    );
    unseen("> lazy start\ncontinues lazily\n\nMine.", "lazy", "continues");
    unseen("- item\n\n  > listed quote\n\nMine.", "listed quote");
    unseen(">no space quote\n\nMine.", "no space");
    expect(
      itemSummary(item({ markdown: "Before.\n\n> a\n> > b\n> c\n\nAfter." })),
    ).toBe("Before. After.");
  });

  it("is escaped when written as HTML, so words that look like one stay in", () => {
    expect(
      itemSummary(
        item({ markdown: "I typed <blockquote>this</blockquote> myself." }),
      ),
    ).toContain("this");
  });

  it("leaves a post with only quotes with no words, without a quote's words as its name", () => {
    const post = item({ kind: "note", markdown: quote });
    expect(itemSummary(post)).toBe("");
    expect(itemHeadline(post)).toBe("Note");
    const placed = itemHeadline({
      ...post,
      passages: [{ start: 43003016, end: 43003016, translationId: "bsb" }],
    });
    expect(placed).toBe("John 3:16");
    expect(
      itemHeadline(item({ kind: "reflection", markdown: "> Only a quote." })),
    ).toBe("Reflection");
  });

  it("is kept whole in the stored Markdown", () => {
    const markdown = `${quote}\n\nMine.`;
    itemSummary(item({ markdown }));
    expect(markdown).toContain("The words of the note.");
  });
});

describe("a link to an item by its id", () => {
  const reflection = item({
    kind: "reflection",
    title: "No condemnation",
    markdown: "Text.",
  });
  const highlight = item({
    kind: "highlight",
    color: "yellow",
    passages: [{ start: 45008038, end: 45008039, translationId: "bsb" }],
  });

  it("takes a visitor to the permalink of a public or unlisted item", () => {
    expect(itemLinkTarget(reflection, { owner: false })).toBe(
      "/p/no-condemnation-3f9a2c1b7d4e",
    );
    expect(
      itemLinkTarget(
        { ...highlight, visibility: "unlisted" },
        { owner: false },
      ),
    ).toBe("/p/romans-8-38-39-3f9a2c1b7d4e");
  });

  it("takes a visitor nowhere for a private item", () => {
    expect(
      itemLinkTarget(
        { ...reflection, visibility: "private" },
        { owner: false },
      ),
    ).toBeUndefined();
  });

  it("takes the owner to the item itself, however visible it is", () => {
    for (const visibility of ["public", "unlisted", "private"] as const) {
      expect(
        itemLinkTarget({ ...reflection, visibility }, { owner: true }),
      ).toBe(`/items/${ID}/edit`);
      expect(
        itemLinkTarget({ ...highlight, visibility }, { owner: true }),
      ).toBe("/read/romans-8.38-39?v=romans-8.38-39");
    }
  });
});

describe("passage pages", () => {
  it("are written as the reader writes passages", () => {
    expect(passagePath([{ start: 45008001, end: 45008039 }])).toBe(
      "/passage/romans-8",
    );
    expect(passagePath([{ start: 43003016, end: 43003021 }], 2)).toBe(
      "/passage/john-3.16-21?page=2",
    );
  });

  it("read anything the reader reads, and hyphens throughout", () => {
    expect(parsePassage("rom-8")).toEqual([{ start: 45008001, end: 45008039 }]);
    expect(parsePassage("john-3.16-21")).toEqual([
      { start: 43003016, end: 43003021 },
    ]);
    expect(parsePassage("john-3-16-21")).toEqual([
      { start: 43003016, end: 43003021 },
    ]);
    expect(parsePassage("1-john-4-7-12")).toEqual([
      { start: 62004007, end: 62004012 },
    ]);
    expect(parsePassage("john-3-16-4-2")).toEqual([
      { start: 43003016, end: 43004002 },
    ]);
    expect(parsePassage("jn3.16")).toEqual([
      { start: 43003016, end: 43003016 },
    ]);
    expect(parsePassage("nowhere-3")).toBeUndefined();
    expect(parsePassage("john-3-99-100")).toBeUndefined();
  });
});

describe("the other public URLs", () => {
  it("page the front page, tags and passages", () => {
    expect(homePath()).toBe("/");
    expect(homePath(1)).toBe("/");
    expect(homePath(3)).toBe("/?page=3");
    expect(tagPath("holy-spirit")).toBe("/tag/holy-spirit");
    expect(tagPath("für", 2)).toBe("/tag/f%C3%BCr?page=2");
  });

  it("put feeds beside the page they are of", () => {
    expect(feedPath("rss")).toBe("/rss.xml");
    expect(feedPath("atom", "/")).toBe("/atom.xml");
    expect(feedPath("rss", "/tag/grace")).toBe("/tag/grace/rss.xml");
    expect(feedPath("atom", "/passage/romans-8")).toBe(
      "/passage/romans-8/atom.xml",
    );
  });

  it("read a page number, and nothing else", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("4")).toBe(4);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("2; drop table")).toBe(1);
  });

  it("decode a segment, and keep one that is not encoded right", () => {
    expect(decodeSegment("f%C3%BCr")).toBe("für");
    expect(decodeSegment("100%")).toBe("100%");
  });
});
