import { describe, expect, it } from "vitest";

import { docToMarkdown, markdownToDoc, type EditorDoc } from "@/lib/items/editor-document";
import { itemHeadline, itemSummary } from "@/lib/public-url";
import { renderMarkdown } from "@/lib/items/markdown";
import { shareAlikeNotice, shareAlikeQuotes } from "@/lib/items/share-alike";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";

import { pickQuote } from "./commentators";
import { makeQuote, quoteCredit, quoteNode, quotedWords, shortenQuote, sourceQuoteNode, QUOTE_MAX_WORDS, type SourceQuote } from "./quote";
import { ASK_SOURCES, SHARE_ALIKE_SOURCES, sourceLabel } from "./sources";

const stored = (id: string) => {
  const source = COMMENTARY_SOURCES.find((each) => each.id === id)!;
  return { id, name: source.name, license: source.license, attribution: source.attribution, sourceUrl: source.sourceUrl };
};
const on = { reference: "John 3:16", href: "/read/john-3.16" };
const note = makeQuote(stored("tyndale"), on, { text: "God’s love is shown *here* […]", shortened: true });
const henry = makeQuote(stored("matthew-henry"), on, { text: "Love is the source.", shortened: false });
const credit = (quote: SourceQuote) => quoteCredit(quote).map((node) => node.text).join("");
const links = (quote: SourceQuote) => quoteCredit(quote).flatMap((node) => (node.marks ?? []).flatMap((mark) => (mark.type === "link" ? [mark.attrs.href] : [])));

const postWith = (quote: SourceQuote): EditorDoc => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "My own words." }] },
    quoteNode(quote),
    { type: "paragraph", content: [{ type: "text", text: "More of my own." }] },
  ],
});

// The same post as the editor holds it now: the quote as one block.
const editedWith = (quote: SourceQuote): EditorDoc => ({
  ...postWith(quote),
  content: postWith(quote).content.map((node) => (node.type === "blockquote" ? sourceQuoteNode(quote) : node)),
});

describe("the sources table", () => {
  it("names every source that holds text, with a tradition", () => {
    expect(Object.keys(ASK_SOURCES).sort()).toEqual(COMMENTARY_SOURCES.map((source) => source.id).sort());
    for (const source of Object.values(ASK_SOURCES)) expect(source.tradition).toBeTruthy();
  });

  it("says who speaks in the words of an answer", () => {
    expect(sourceLabel(ASK_SOURCES["matthew-henry"])).toBe("Matthew Henry (English Puritan tradition)");
    expect(sourceLabel(ASK_SOURCES["adam-clarke"])).toBe("Adam Clarke (Wesleyan Methodist tradition)");
    expect(ASK_SOURCES.tyndale.tradition).toBeTruthy();
  });

  it("has a share-alike entry for every source whose stored license is one", () => {
    const shareAlike = COMMENTARY_SOURCES.filter((source) => /\bSA\b/.test(source.license)).map((source) => source.id);
    expect(SHARE_ALIKE_SOURCES.map((source) => source.id)).toEqual(shareAlike);
  });

  it("credits the holder the stored attribution names", () => {
    const tyndale = COMMENTARY_SOURCES.find((source) => source.id === "tyndale")!;
    expect(tyndale.attribution).toContain(ASK_SOURCES.tyndale.shareAlike!.credit);
  });
});

describe("every quoted note carries its attribution and license", () => {
  it("in a quote, from the stored source", () => {
    expect(note.attribution).toBe(stored("tyndale").attribution);
    expect(note.license).toBe("CC BY-SA 4.0");
    expect(note.sourceUrl).toBe(stored("tyndale").sourceUrl);
    expect(note.shareAlike).toEqual({ name: "Tyndale Open Study Notes", credit: "© 2022 Tyndale House Publishers", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" });
  });

  it("in its credit line, which links the license, the source and the passage", () => {
    const line = credit(note);
    expect(line).toContain("Adapted from Tyndale Open Study Notes");
    expect(line).toContain("© 2022 Tyndale House Publishers");
    expect(line).toContain("CC BY-SA 4.0");
    expect(line).toContain("the rest of this post is not");
    expect(line).toContain("Protestant evangelical tradition");
    expect(links(note)).toEqual([stored("tyndale").sourceUrl, "/read/john-3.16", "https://creativecommons.org/licenses/by-sa/4.0/"]);
  });

  it("names a public-domain commentator with author, work and tradition", () => {
    expect(henry.shareAlike).toBeUndefined();
    expect(credit(henry)).toBe("— Matthew Henry (English Puritan tradition), Commentary on the Whole Bible, on John 3:16. Public domain.");
  });
});

describe("marking changes to the words", () => {
  it("leaves a short quote alone", () => {
    expect(shortenQuote("  God so   loved ")).toEqual({ text: "God so loved", shortened: false });
  });

  it("marks a cut", () => {
    const { text, shortened } = shortenQuote(Array(QUOTE_MAX_WORDS + 5).fill("word").join(" "));
    expect(shortened).toBe(true);
    expect(text.endsWith(" […]")).toBe(true);
  });

  it("picks the sentence nearest the passage, and marks what it left out on both sides", () => {
    const text = "Of other things. The love of God is great. Then more of this. And more again.";
    const { text: quote, shortened } = pickQuote(text, ["love", "god"]);
    expect(shortened).toBe(true);
    expect(quote.startsWith("[…] The love of God is great.")).toBe(true);
  });

  it("marks nothing when all of it is quoted", () => {
    expect(pickQuote("The love of God.", ["love"])).toEqual({ text: "The love of God.", shortened: false });
  });

  it("keeps to the limit however long a sentence runs", () => {
    const { text, shortened } = pickQuote(Array(200).fill("word").join(" "), ["word"]);
    expect(shortened).toBe(true);
    expect(text.split(" ").length).toBeLessThanOrEqual(QUOTE_MAX_WORDS + 1);
  });
});

describe("a quote in a post", () => {
  const markdown = docToMarkdown(postWith(note));

  it("is a blockquote with its credit inside it, apart from the writer's prose", () => {
    const quoteLines = markdown.split("\n").filter((line) => line.startsWith(">"));
    expect(quoteLines.join("\n")).toContain("Tyndale Open Study Notes");
    expect(quoteLines.join("\n")).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(quoteLines.join("\n")).not.toContain("My own words");
    expect(markdown).toContain("My own words.\n");
  });

  it("is stored as the same blockquote whether the editor holds it as one block or not", () => {
    expect(docToMarkdown(editedWith(note))).toBe(markdown);
    expect(docToMarkdown(editedWith(henry))).toBe(docToMarkdown(postWith(henry)));
  });

  it("survives the trip through the storage format exactly, and opens as one block", () => {
    const opened = markdownToDoc(markdown);
    expect(opened).toEqual(editedWith(note));
    expect(opened.content[1].attrs).toEqual({ quote: quotedWords(note) });
    expect(docToMarkdown(opened)).toBe(markdown);
    expect(docToMarkdown(markdownToDoc(docToMarkdown(postWith(henry))))).toBe(docToMarkdown(postWith(henry)));
    expect(markdownToDoc(docToMarkdown(postWith(henry))).content[1].type).toBe("sourceQuote");
  });

  it("keeps its marked cut and the literal asterisks of its words", () => {
    expect(markdown).toContain("[…]");
    const html = renderMarkdown(markdown);
    expect(html).toContain("*here*");
    expect(html).not.toContain("<em>");
  });

  it("prints as a quote with working links", () => {
    const html = renderMarkdown(markdown);
    expect(html).toContain("<blockquote>");
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
    expect(html).toContain('href="/read/john-3.16"');
  });

  it("keeps a two-paragraph quote together", () => {
    const long = { ...note, text: "First part.\nSecond part." };
    const stored = docToMarkdown(postWith(long));
    expect(stored).toContain("> First part.\n>\n> Second part.\n>\n> — Adapted");
    expect(shareAlikeQuotes(stored)).toHaveLength(1);
  });
});

describe("the detector", () => {
  const markdown = docToMarkdown(postWith(note));

  it("finds a share-alike quote in stored Markdown, and its notice names the license", () => {
    const [source] = shareAlikeQuotes(markdown);
    expect(source.id).toBe("tyndale");
    expect(shareAlikeNotice(source)).toContain("CC BY-SA 4.0");
    expect(shareAlikeNotice(source)).toContain("© 2022 Tyndale House Publishers");
  });

  it("still finds it when the writer has edited the credit line", () => {
    expect(shareAlikeQuotes("> Words.\n>\n> Tyndale Open Study Notes, somewhat reworded")).toHaveLength(1);
  });

  it("finds nothing in a post without one", () => {
    expect(shareAlikeQuotes(docToMarkdown(postWith(henry)))).toEqual([]);
    expect(shareAlikeQuotes("I read the Tyndale Open Study Notes today.")).toEqual([]);
    expect(shareAlikeQuotes(null)).toEqual([]);
    expect(shareAlikeQuotes("")).toEqual([]);
  });
});

// What the public side reads from a post with a share-alike quote. It reads
// stored Markdown only, so these hold for a post saved before the editor kept
// a quote as one block and for one saved after.
describe("a published post with a quote from the editor", () => {
  const markdown = docToMarkdown(editedWith(note));
  const reflection = { kind: "reflection" as const, title: null, markdown, note: null, passages: [] };

  it("prints the notice, with the credit and its links in the quote", () => {
    expect(shareAlikeQuotes(markdown).map((source) => source.id)).toEqual(["tyndale"]);
    const html = renderMarkdown(markdown);
    expect(html).toMatch(/<blockquote>[\s\S]*Tyndale Open Study Notes[\s\S]*<\/blockquote>/);
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
  });

  it("keeps the note's words and credit out of the summary and an untitled post's name", () => {
    for (const text of [itemSummary(reflection, 1000), itemHeadline(reflection)]) {
      expect(text).toContain("My own words.");
      expect(text).not.toContain("God’s love");
      expect(text).not.toContain("Tyndale");
    }
  });

  it("still prints the notice after the post is opened and saved again, in a reflection or a note", () => {
    for (const passages of [true, false]) {
      const again = docToMarkdown(markdownToDoc(markdown, { passages }));
      expect(again).toBe(markdown);
      expect(shareAlikeQuotes(again).map((source) => source.id)).toEqual(["tyndale"]);
    }
  });
});
