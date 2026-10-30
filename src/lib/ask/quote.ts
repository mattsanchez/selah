import type { EditorNode } from "@/lib/items/editor-document";

import { ASK_SOURCES, sourceLabel } from "./sources";

// A few words of a commentary or a study note, with everything owed to it.
// An answer's quotes and the cards of "What do commentators say" are both
// made here, from what is stored with the source: the model's word is never
// taken for who said something or under what license.

export const QUOTE_MAX_WORDS = 50;

export type SourceQuote = {
  sourceId: string;
  // "Matthew Henry (English Puritan tradition)".
  label: string;
  // "Commentary on the Whole Bible", for a source that is one work of an author.
  work?: string;
  // The passage the entry is on, and that passage in the reader.
  reference: string;
  href: string;
  // The words. "[…]" stands wherever words were left out.
  text: string;
  // Whether anything was left out.
  shortened: boolean;
  // As stored in `commentary_source`.
  license: string;
  attribution: string;
  sourceUrl: string;
  // For a source under a license that travels with its words: the short
  // credit, and the license's address. See ASK_SOURCES.
  shareAlike?: { name: string; credit: string; licenseUrl: string };
};

// What is stored with a source, as the queries return it.
export type StoredSource = { id: string; name: string; license: string; attribution: string; sourceUrl: string };

export function makeQuote(
  source: StoredSource,
  on: { reference: string; href: string },
  words: { text: string; shortened: boolean },
): SourceQuote {
  const known = ASK_SOURCES[source.id];
  return {
    sourceId: source.id,
    label: known ? sourceLabel(known) : source.name,
    work: known?.work,
    reference: on.reference,
    href: on.href,
    ...words,
    license: source.license,
    attribution: source.attribution,
    sourceUrl: source.sourceUrl,
    ...(known?.shareAlike && { shareAlike: { name: known.author, ...known.shareAlike } }),
  };
}

// The text cut to QUOTE_MAX_WORDS, and the cut marked.
export function shortenQuote(text: string): { text: string; shortened: boolean } {
  const words = text.trim().split(/\s+/);
  if (words.length <= QUOTE_MAX_WORDS) return { text: words.join(" "), shortened: false };
  return { text: `${words.slice(0, QUOTE_MAX_WORDS).join(" ")} […]`, shortened: true };
}

const link = (text: string, href: string): EditorNode => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }],
});
const plain = (text: string): EditorNode => ({ type: "text", text });

// The line of a quote that says whose it is, as text and links.
export function quoteCredit(quote: SourceQuote): EditorNode[] {
  if (quote.shareAlike) {
    const { name, credit, licenseUrl } = quote.shareAlike;
    const tradition = ASK_SOURCES[quote.sourceId]?.tradition;
    return [
      plain("— Adapted from "),
      link(name, quote.sourceUrl),
      plain(`${tradition ? ` (${tradition} tradition)` : ""} on `),
      link(quote.reference, quote.href),
      plain(`, ${credit}, `),
      link(quote.license, licenseUrl),
      plain(". This quoted note is under that license; the rest of this post is not."),
    ];
  }
  return [
    plain(`— ${quote.label}${quote.work ? `, ${quote.work}` : ""}, on `),
    link(quote.reference, quote.href),
    plain(`. ${quote.license}.`),
  ];
}

// The quote as the editor's block: the words, then the credit inside the same
// blockquote, so the two stay together and apart from the writer's own prose.
// As Markdown it is a plain blockquote (see docToMarkdown), which is why it
// needs no format of its own.
export function quoteNode(quote: SourceQuote): EditorNode {
  return {
    type: "blockquote",
    content: [
      ...quote.text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ type: "paragraph", content: [plain(line)] })),
      { type: "paragraph", content: quoteCredit(quote) },
    ],
  };
}
