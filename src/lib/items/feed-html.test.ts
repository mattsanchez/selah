import { describe, expect, it } from "vitest";

import type { Translation } from "@/lib/bible/passage";
import type { VerseRecord } from "@/lib/bible/types";

import type { FeedEntry, PassageCardView } from "./feed";
import { absoluteLinks, cardText, entryHtml, quoteVerses } from "./feed-html";
import type { Item } from "./queries";

const BSB: Translation = {
  id: "bsb",
  name: "Berean Standard Bible",
  abbrev: "BSB",
  license: "Public domain",
  attribution: "Berean Standard Bible (BSB), public domain.",
  sourceUrl: "https://berean.bible/",
  provider: "local",
};

const verse = (verseId: number, text: string, values: Partial<VerseRecord> = {}): VerseRecord => ({
  verseId,
  text,
  headings: [],
  footnotes: [],
  breaks: [],
  wordsOfJesus: [],
  ...values,
});

const card = (values: Partial<PassageCardView> = {}): PassageCardView => ({
  ranges: [{ start: 45008038, end: 45008039 }],
  reference: "Romans 8:38-39",
  translation: BSB,
  runs: [
    [
      verse(45008038, "For I am convinced that neither death nor life,"),
      verse(45008039, "neither height nor depth <nor> anything else"),
    ],
  ],
  more: false,
  href: "/read/romans-8.38-39",
  ...values,
});

const item = (values: Partial<Item>): Item => ({
  id: "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b",
  kind: "highlight",
  title: null,
  markdown: null,
  note: null,
  color: "yellow",
  visibility: "public",
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  passages: [],
  tags: [],
  ...values,
});

describe("entryHtml", () => {
  it("quotes a highlight's verses with their reference, its note and the attribution", () => {
    const entry: FeedEntry = {
      item: item({ note: "Me & <you>" }),
      passage: card(),
      blocks: [],
      translations: [BSB],
    };
    const html = entryHtml(entry, "https://selah.example.org");
    expect(html).toContain(
      "<blockquote><p><sup>38</sup>\u00a0For I am convinced that neither death nor life, <sup>39</sup>\u00a0neither height nor depth &lt;nor&gt; anything else</p>",
    );
    expect(html).toContain(
      `— <a href="https://selah.example.org/read/romans-8.38-39">Romans 8:38-39</a> (BSB)</p></blockquote>`,
    );
    expect(html).toContain("<p>Me &amp; &lt;you&gt;</p>");
    expect(html).toContain(
      `<p><small>Berean Standard Bible (BSB), public domain. <a href="https://berean.bible/">Source</a></small></p>`,
    );
  });

  it("prints a reflection's Markdown with links made absolute, and its cards", () => {
    const entry: FeedEntry = {
      item: item({ kind: "reflection", color: null }),
      blocks: [
        { type: "html", html: `<p><a href="/read/romans-8">Romans 8</a> and <a href="https://x.org/">x</a></p>` },
        { type: "card", card: card({ runs: [[verse(45008038, "One verse")]] }) },
        { type: "bad-card", source: "[[Nowhere 9]]", error: "No such book." },
      ],
      translations: [],
    };
    const html = entryHtml(entry, "https://selah.example.org");
    expect(html).toContain(`<a href="https://selah.example.org/read/romans-8">Romans 8</a>`);
    expect(html).toContain(`<a href="https://x.org/">x</a>`);
    expect(html).toContain("<blockquote><p>One verse</p>");
    expect(html).toContain("<p>[[Nowhere 9]]</p>");
  });
});

describe("a card's verses", () => {
  const html = (runs: VerseRecord[][], more = false) =>
    entryHtml(
      { item: item({}), passage: card({ runs, more }), blocks: [], translations: [] },
      "https://selah.example.org",
    );

  it("break as the reader breaks them: lines of poetry, and paragraphs", () => {
    // Psalm 121:1-2 in the BSB: two verses of two lines each.
    expect(
      html([
        [
          verse(19121001, "I lift up my eyes to the hills.\nFrom where does my help come?", {
            breaks: [{ kind: "paragraph", offset: 0 }],
          }),
          verse(19121002, "My help comes from the LORD,\nthe Maker of heaven and earth.", {
            breaks: [{ kind: "line", offset: 0 }],
          }),
        ],
      ]),
    ).toContain(
      "<blockquote><p><sup>1</sup>\u00a0I lift up my eyes to the hills.<br/>From where does my help come?<br/><sup>2</sup>\u00a0My help comes from the LORD,<br/>the Maker of heaven and earth.</p><p>— ",
    );
    expect(
      html([[verse(45008038, "One."), verse(45008039, "Two.", { breaks: [{ kind: "paragraph", offset: 0 }] })]]),
    ).toContain("<blockquote><p><sup>38</sup>\u00a0One.</p><p><sup>39</sup>\u00a0Two.</p>");
  });

  it("print the words of Jesus in red", () => {
    expect(
      html([[verse(43011025, "Jesus said to her, “I am the resurrection.”", { wordsOfJesus: [{ start: 19, end: 43 }] })]]),
    ).toContain(
      `<blockquote><p>Jesus said to her, <span class="words-of-jesus" style="color:#b91c1c">“I am the resurrection.”</span></p>`,
    );
  });

  it("mark verses left out, and the gap between two runs", () => {
    expect(html([[verse(43003016, "For God so loved.")], [verse(43003018, "Whoever believes.")]], true)).toContain(
      "<blockquote><p><sup>16</sup>\u00a0For God so loved.</p><p>…</p><p><sup>18</sup>\u00a0Whoever believes.</p><p>…</p><p>— ",
    );
  });
});

describe("absoluteLinks", () => {
  it("leaves addresses elsewhere alone", () => {
    expect(absoluteLinks(`<img src="/a.png"><a href="//cdn.example/x">`, "http://h")).toBe(
      `<img src="http://h/a.png"><a href="//cdn.example/x">`,
    );
  });
});

describe("cardText", () => {
  it("is the verses on one line, cut between words", () => {
    expect(cardText(card())).toBe(
      "For I am convinced that neither death nor life, neither height nor depth <nor> anything else",
    );
    expect(cardText(card(), 30)).toBe("For I am convinced that…");
    expect(cardText(card({ more: true }))).toMatch(/anything else …$/);
    expect(
      cardText(card({ runs: [[verse(19121001, "I lift up my eyes to the hills.\nFrom where does my help come?")]] })),
    ).toBe("I lift up my eyes to the hills. From where does my help come?");
  });
});

describe("quoteVerses", () => {
  it("quotes verses once", () => {
    expect(quoteVerses("For God so loved the world")).toBe("“For God so loved the world”");
    expect(quoteVerses("“Be still, and know that I am God.”")).toBe("“Be still, and know that I am God.”");
  });
});
