import { describe, expect, it } from "vitest";

import type { VerseRecord } from "@/lib/bible/types";
import { CARD_CHARS } from "@/lib/items/card-length";

import { linkHref } from "./links";
import { cutVerses, passageKey } from "./types";

const verse = (verseId: number, length: number): VerseRecord => ({
  verseId,
  text: "x".repeat(length),
  headings: [],
  footnotes: [],
  breaks: [],
  wordsOfJesus: [],
});

describe("linkHref", () => {
  it("takes web addresses, email addresses and paths on this site", () => {
    expect(linkHref("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(linkHref(" example.org/vine ")).toBe("https://example.org/vine");
    expect(linkHref("someone@example.org")).toBe("mailto:someone@example.org");
    expect(linkHref("mailto:someone@example.org")).toBe("mailto:someone@example.org");
    expect(linkHref("/items/abc")).toBe("/items/abc");
    expect(linkHref("#notes")).toBe("#notes");
  });

  it("refuses anything else, scripts included", () => {
    for (const typed of ["", "  ", "javascript:alert(1)", "data:text/html,x", "//evil.example", "just words"]) {
      expect(linkHref(typed)).toBeUndefined();
    }
  });
});

describe("cutVerses", () => {
  it("keeps every verse of a short passage", () => {
    const runs = [[verse(43003016, 100), verse(43003017, 100)], [verse(43004001, 50)]];
    expect(cutVerses(runs)).toEqual({ verses: runs, more: false });
  });

  it("stops before the verse that would pass the card's length, as the feed does", () => {
    const half = Math.ceil(CARD_CHARS / 2);
    const runs = [[verse(19119001, half), verse(19119002, half - 10), verse(19119003, 20)]];
    expect(cutVerses(runs)).toEqual({ verses: [runs[0].slice(0, 2)], more: true });
  });

  it("always keeps the first verse, however long", () => {
    const long = verse(19119001, CARD_CHARS * 2);
    expect(cutVerses([[long, verse(19119002, 5)]])).toEqual({ verses: [[long]], more: true });
  });
});

describe("passageKey", () => {
  it("is the same for the same passage however it is written", () => {
    expect(passageKey(" John 3:16 ", "KJV", "card")).toBe(passageKey("john 3:16", "kjv", "card"));
    expect(passageKey("John 3:16", null, "card")).toBe(passageKey("John 3:16", undefined, "card"));
    expect(passageKey("John 3:16", null, "card")).not.toBe(passageKey("John 3:16", null, "reading"));
  });
});
