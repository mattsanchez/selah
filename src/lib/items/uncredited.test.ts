import { describe, expect, it, vi } from "vitest";

import type { Db } from "@/db/client";
import { makeQuote, quoteNode, sourceQuoteNode } from "@/lib/ask/quote";
import { SHARE_ALIKE_SOURCES } from "@/lib/ask/sources";
import { docToMarkdown, markdownToDoc, type EditorDoc } from "@/lib/items/editor-document";
import { readCommentaryFixture } from "@/lib/study/import/fixture";
import { studyText } from "@/lib/study/html";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";

import { runKeys, readWords } from "./source-words";
import { SourceNotes, findUncredited, uncreditedText } from "./uncredited";

// The fixture's Tyndale notes, as the database holds them.
const notes = (await readCommentaryFixture("tyndale")).map((entry) => ({ sourceId: "tyndale", ...entry }));
const tyndale = new SourceNotes(notes);
const john316 = notes.find((note) => note.verseStart === 43003016 && note.verseEnd === 43003016)!;

// "The truth that God loved the world is basic to Christian understanding (1 Jn 4:9-10)."
const sentence = studyText(john316.html).replace(/^3:16\s*/, "").split(". ")[0] + ".";
const second = studyText(john316.html).split(". ")[1] + ".";

const stored = (id: string) => {
  const source = COMMENTARY_SOURCES.find((each) => each.id === id)!;
  return { id, name: source.name, license: source.license, attribution: source.attribution, sourceUrl: source.sourceUrl };
};
const quote = makeQuote(stored("tyndale"), { reference: "John 3:16", href: "/read/john-3.16" }, { text: sentence, shortened: false });
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const post = (...content: EditorDoc["content"]): string => docToMarkdown({ type: "doc", content });

describe("the post's words that no quote credits", () => {
  const source = SHARE_ALIKE_SOURCES.find((each) => each.id === "tyndale")!;

  it("leaves out a quote inserted from Ask, as stored and as the editor saves it again", () => {
    const stored = post(paragraph("My own words."), quoteNode(quote), paragraph("More of mine."));
    expect(uncreditedText(stored, source)).toBe("My own words. More of mine.");
    const saved = post(paragraph("My own words."), sourceQuoteNode(quote), paragraph("More of mine."));
    expect(saved).toBe(stored);
    expect(docToMarkdown(markdownToDoc(stored))).toBe(stored);
    expect(uncreditedText(saved, source)).toBe("My own words. More of mine.");
  });

  it("keeps a quote that does not name the source, and one whose credit was taken off", () => {
    expect(uncreditedText(`Mine.\n\n> ${sentence}`, source)).toContain("God loved the world");
    expect(uncreditedText(`Mine.\n\n> ${sentence}\n>\n> — from a study Bible`, source)).toContain("God loved the world");
  });

  it("counts a writer's own quote that names the source, since the public site prints the notice for it", () => {
    const markdown = `Mine.\n\n> ${sentence}\n>\n> — Tyndale Open Study Notes, CC BY-SA 4.0`;
    expect(uncreditedText(markdown, source)).toBe("Mine.");
  });

  it("does not let a crediting quote vouch for the words outside it", () => {
    const markdown = post(paragraph(second), quoteNode(quote));
    expect(uncreditedText(markdown, source)).toBe(second);
  });
});

describe("SourceNotes.matches", () => {
  it("finds a pasted sentence of a note, with where to read the note and its license", () => {
    const [match, ...others] = tyndale.matches(`I was struck this morning. ${sentence} So I prayed.`);
    expect(others).toEqual([]);
    expect(match).toMatchObject({
      sourceId: "tyndale",
      source: "Tyndale Open Study Notes",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: "https://tyndaleopenresources.com/",
      reference: "John 3:16",
      href: "/read/john-3.16?v=john-3.16&full=tyndale",
      words: readWords(sentence).length,
    });
    // From the post as written, to where the run ends.
    expect(match.excerpt).toBe("The truth that God loved the world is basic to Christian understanding (1 Jn");
  });

  it("finds the words whatever their case, curly quotes or spacing", () => {
    const retyped = sentence.toUpperCase().replace(/\s+/g, "   ").replace("(", "“").replace(")", "”");
    expect(tyndale.matches(retyped)).toHaveLength(1);
  });

  it("finds nothing in a post that quotes the note through Ask", () => {
    const markdown = post(paragraph("My own words."), quoteNode(quote), paragraph("More of mine."));
    expect(tyndale.matches(markdown)).toEqual([]);
  });

  it("finds the words when the inserted quote's credit was deleted or Quote was turned off", () => {
    expect(tyndale.matches(`Mine.\n\n> ${sentence}`)).toHaveLength(1);
    expect(tyndale.matches(post(paragraph("Mine."), paragraph(sentence)))).toHaveLength(1);
  });

  it("finds nothing in fewer than 12 words of a note, or in common phrases", () => {
    const eleven = readWords(sentence).slice(0, 11).map((word) => sentence.slice(word.start, word.end)).join(" ");
    expect(tyndale.matches(`Today: ${eleven}. Then my own thoughts on it.`)).toEqual([]);
    expect(tyndale.matches("God loved the world. Jesus is the Son of God and the light of the world.")).toEqual([]);
  });

  it("finds nothing when one changed word leaves no 12 in a row", () => {
    const words = readWords(sentence).map((word) => sentence.slice(word.start, word.end));
    words[6] = "plainly";
    expect(tyndale.matches(words.join(" "))).toEqual([]);
  });

  it("does not take Scripture the note quotes for the note's words", () => {
    const verse = "For God so loved the world that He gave His one and only Son";
    const quoting = [{ sourceId: "tyndale", verseStart: 43003016, verseEnd: 43003016, html: `<p>3:16 ${verse}, says Jesus, and he means it.</p>` }];
    const writer = `As the verse says, ${verse}.`;
    expect(new SourceNotes(quoting).matches(writer)).toHaveLength(1);
    expect(new SourceNotes(quoting, [runKeys(readWords(verse).map((word) => word.norm))]).matches(writer)).toEqual([]);
  });

  it("names a sentence the notes repeat once", () => {
    const repeated = "This is a long explanatory sentence the notes repeat on several passages word for word.";
    const many = [43003016, 43003017, 43003018].map((verse) => ({
      sourceId: "tyndale",
      verseStart: verse,
      verseEnd: verse,
      html: `<p>${repeated} And something about verse ${verse}.</p>`,
    }));
    expect(new SourceNotes(many).matches(`Mine. ${repeated}`)).toHaveLength(1);
  });

  it("names each note a post copies from, in the order of the post", () => {
    const romans = notes.find((note) => note.verseStart === 45008030)!;
    const fromRomans = studyText(romans.html).replace(/^8:30\s*/, "");
    const matches = tyndale.matches(`${fromRomans}\n\nAnd then:\n\n${sentence}`);
    expect(matches.map((match) => match.reference)).toEqual(["Romans 8:30", "John 3:16"]);
    // A long copy is shown by its first words.
    expect(matches[0].excerpt).toMatch(/^gave them his glory: Elsewhere in this passage\b.* …$/);
    expect(matches[0].words).toBeGreaterThan(30);
  });
});

describe("findUncredited", () => {
  // A database whose counts are `n`; anything else it is asked fails the test.
  const counting = (n: number) => {
    const query = { from: () => query, where: () => query, then: (done: (rows: { n: number }[]) => void) => done([{ n }]) };
    return { select: vi.fn(() => query) } as unknown as Db & { select: ReturnType<typeof vi.fn> };
  };

  it("does not look anything up for a post too short to hold a run", async () => {
    const db = counting(0);
    expect(await findUncredited(db, "A few words of my own.")).toEqual({ checked: true, matches: [] });
    expect(await findUncredited(db, null)).toEqual({ checked: true, matches: [] });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("says it could not check when the notes are not in the database", async () => {
    expect(await findUncredited(counting(0), `Mine. ${sentence}`)).toEqual({ checked: false, matches: [] });
  });
});
