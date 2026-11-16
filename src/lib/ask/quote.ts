import type { EditorNode } from "@/lib/items/editor-document";

import { COMMENTARY_SOURCES } from "@/lib/study/sources";

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

// What a quote in a post keeps: its words, and all its credit is made from.
export type QuotedWords = Pick<
  SourceQuote,
  "sourceId" | "label" | "work" | "reference" | "href" | "text" | "license" | "sourceUrl" | "shareAlike"
>;

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
export function quoteCredit(quote: QuotedWords): EditorNode[] {
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

// The quote as a blockquote: the words, then the credit inside the same
// blockquote, so the two stay together and apart from the writer's own prose.
// This is how a quote is stored (docToMarkdown writes a source quote as this
// blockquote), so it needs no Markdown of its own.
export function quoteNode(quote: QuotedWords): EditorNode {
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

// --- A quote in the editor ---
//
// In the editor a quote is one block, `sourceQuote` (see
// src/components/editor/source-quote-node.tsx): its words and its credit are
// printed by the app and cannot be edited, split or taken apart; the block is
// moved, deleted and undone whole. It is stored as quoteNode() above, and
// read back from that blockquote when the post opens (readSourceQuote below).

export const SOURCE_QUOTE = "sourceQuote";

// Only what the credit is made from, without empty fields.
export function quotedWords(quote: QuotedWords): QuotedWords {
  const { sourceId, label, work, reference, href, text, license, sourceUrl, shareAlike } = quote;
  return {
    sourceId,
    label,
    ...(work && { work }),
    reference,
    href,
    text,
    license,
    sourceUrl,
    ...(shareAlike && { shareAlike: { name: shareAlike.name, credit: shareAlike.credit, licenseUrl: shareAlike.licenseUrl } }),
  };
}

// The editor's block for a quote.
export function sourceQuoteNode(quote: QuotedWords): EditorNode {
  return { type: SOURCE_QUOTE, attrs: { quote: quotedWords(quote) } };
}

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const other = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  return (
    keys.length === other.length &&
    keys.every((key) => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
};

const linkOf = (node: EditorNode) => {
  const mark = node.marks?.find((each) => each.type === "link");
  return mark?.type === "link" ? mark.attrs.href : undefined;
};

// The quote a blockquote is, when it is exactly what quoteNode() makes for a
// source Ask reads: words in plain paragraphs, then the app's own credit for
// that source, unchanged. Anything else (the writer's own quotation, a quote
// whose words or credit were edited in an older version, a source Ask no
// longer reads) is not one, and stays an ordinary blockquote.
//
// Since quoteNode() of what this returns is that blockquote, a quote read
// here is stored again byte for byte.
export function readSourceQuote(node: EditorNode): QuotedWords | undefined {
  if (node.type !== "blockquote") return undefined;
  const paragraphs = node.content ?? [];
  const credit = paragraphs.at(-1);
  const words = paragraphs.slice(0, -1);
  if (!credit || words.length === 0 || paragraphs.some((paragraph) => paragraph.type !== "paragraph")) return undefined;
  const lines: string[] = [];
  for (const paragraph of words) {
    const [only, ...rest] = paragraph.content ?? [];
    if (!only || rest.length > 0 || only.type !== "text" || only.marks?.length || !only.text) return undefined;
    lines.push(only.text);
  }
  const text = lines.join("\n");
  const parts = credit.content ?? [];
  const links = parts.filter((part) => linkOf(part) !== undefined);

  for (const [sourceId, source] of Object.entries(ASK_SOURCES)) {
    const stored = COMMENTARY_SOURCES.find((each) => each.id === sourceId);
    if (!stored) continue;
    // Where the source and its license are, as the app has them: a credit
    // that links elsewhere is not the app's.
    const common = { sourceId, label: sourceLabel(source), work: source.work, text };
    let candidate: QuotedWords;
    if (source.shareAlike) {
      // "— Adapted from [name](source) … on [reference](href), credit, [license](licenseUrl). …"
      if (links.length !== 3) continue;
      const [, passage, license] = links;
      candidate = {
        ...common,
        reference: passage.text ?? "",
        href: linkOf(passage)!,
        license: license.text ?? "",
        sourceUrl: stored.sourceUrl,
        shareAlike: { name: source.author, ...source.shareAlike },
      };
    } else {
      // "— label, work, on [reference](href). license."
      if (links.length !== 1) continue;
      const license = /^\. (.+)\.$/.exec(parts.at(-1)?.text ?? "")?.[1];
      if (!license) continue;
      const [passage] = links;
      candidate = { ...common, reference: passage.text ?? "", href: linkOf(passage)!, license, sourceUrl: stored.sourceUrl };
    }
    if (candidate.reference && same(quoteNode(candidate), node)) return quotedWords(candidate);
  }
  return undefined;
}

// A quote as the editor holds it (a `sourceQuote` block's attribute, which
// a paste can also bring), when it is one readSourceQuote() would read.
export function checkedQuote(value: unknown): QuotedWords | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const quote = value as QuotedWords;
  const fields = [quote.sourceId, quote.label, quote.reference, quote.href, quote.text, quote.license, quote.sourceUrl];
  if (!fields.every((field) => typeof field === "string")) return undefined;
  try {
    return readSourceQuote(quoteNode(quote));
  } catch {
    return undefined;
  }
}
