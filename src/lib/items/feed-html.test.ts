import { describe, expect, it } from "vitest";

import type { Translation } from "@/lib/bible/passage";

import type { FeedEntry, PassageCardView } from "./feed";
import { absoluteLinks, cardText, entryHtml } from "./feed-html";
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

const card = (values: Partial<PassageCardView> = {}): PassageCardView => ({
  ranges: [{ start: 45008038, end: 45008039 }],
  reference: "Romans 8:38-39",
  translation: BSB,
  runs: [
    [
      { verseId: 45008038, text: "For I am convinced that neither death nor life," },
      { verseId: 45008039, text: "neither height nor depth <nor> anything else" },
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
      "<blockquote><p><sup>38</sup> For I am convinced that neither death nor life, <sup>39</sup> neither height nor depth &lt;nor&gt; anything else</p>",
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
        { type: "card", card: card({ runs: [[{ verseId: 45008038, text: "One verse" }]] }) },
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
  });
});
