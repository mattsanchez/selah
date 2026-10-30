import type { Translation } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRecord } from "@/lib/bible/types";
import { findTranslation, parseDocument } from "@/lib/items/cards";
import { itemKey, itemSlug } from "@/lib/public-url";
import type { Item } from "@/lib/items/queries";

import type { ExportItem } from "./format";

// One Markdown file per item, for reading anywhere: front matter, then the
// body. A passage card is written out as a blockquote with its reference and
// its translation's attribution, so the file stands on its own. The card's
// `[[Reference | T]]` line stays in selah-export.json, whose `markdown` is the
// item exactly as stored.

export type Quote = { translation: Translation; runs: VerseRecord[][] };

// Verses of a reference in a translation, or undefined when none is loaded.
export type QuoteLookup = (
  ranges: readonly { start: number; end: number }[],
  translation: Translation | undefined,
) => Promise<Quote | undefined>;

const FOLDERS = { highlight: "highlights", reflection: "reflections", note: "notes" } as const;

// "items/reflections/2026-10-30-on-grace-3f9a2c1b7d4e.md". Sorts by date, says
// what it is, and the key keeps two items of one day and name apart.
export function itemFilePath(item: Item): string {
  const date = item.createdAt.toISOString().slice(0, 10);
  const slug = itemSlug(item);
  return `items/${FOLDERS[item.kind]}/${date}-${slug ? `${slug}-` : ""}${itemKey(item.id)}.md`;
}

// JSON strings are YAML strings, and need no thought about what is in them.
const yaml = (value: string | null | readonly string[]) => JSON.stringify(value);

export function frontMatter(item: ExportItem, headline: string): string {
  const lines = [
    `id: ${item.id}`,
    `kind: ${item.kind}`,
    `title: ${yaml(item.title ?? headline)}`,
    `visibility: ${item.visibility}`,
    `created: ${item.createdAt}`,
    `updated: ${item.updatedAt}`,
    ...(item.publishedAt ? [`published: ${item.publishedAt}`] : []),
    ...(item.color ? [`color: ${item.color}`] : []),
    ...(item.tags.length > 0 ? [`tags: ${yaml(item.tags.map((tag) => tag.name))}`] : []),
    ...(item.passages.length > 0
      ? [`passages: ${yaml(item.passages.map((passage) => passage.reference))}`]
      : []),
    ...(item.permalink ? [`permalink: ${yaml(item.permalink)}`] : []),
  ];
  return `---\n${lines.join("\n")}\n---\n`;
}

// A passage as a blockquote: each verse numbered when there are several, lines
// of poetry kept, then who to credit.
export function quoteMarkdown({ translation, runs }: Quote, reference: string): string {
  const numbered = runs.flat().length > 1;
  const verses = runs.flat().map(({ verseId, text }) => {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const body = lines.join("  \n> ");
    return `> ${numbered ? `**${verseId % 1000}** ` : ""}${body}`;
  });
  return [...verses.flatMap((verse) => [verse, ">"]), `> — ${reference} (${translation.abbrev}). ${translation.attribution}`].join("\n");
}

async function passageQuotes(item: Item, translations: readonly Translation[], lookup: QuoteLookup) {
  const quotes: string[] = [];
  for (const passage of item.passages) {
    const translation = translations.find((each) => each.id === passage.translationId) ?? translations[0];
    const quote = await lookup([passage], translation);
    const reference = formatReference([passage]);
    quotes.push(quote ? quoteMarkdown(quote, reference) : `> ${reference}`);
  }
  return quotes;
}

// The body of an item's file. `translations` is every loaded translation, the
// site's default first.
export async function itemBody(
  item: Item,
  translations: readonly Translation[],
  lookup: QuoteLookup,
): Promise<string> {
  const parts: string[] = [];
  if (item.kind === "reflection") {
    if (item.title) parts.push(`# ${item.title}`);
    for (const segment of parseDocument(item.markdown ?? "")) {
      if (segment.type === "markdown") {
        parts.push(segment.text.trim());
      } else if (!segment.ranges) {
        parts.push(segment.source);
      } else {
        const translation = findTranslation(segment.translation, translations) ?? translations[0];
        const quote = await lookup(segment.ranges, translation);
        parts.push(quote ? quoteMarkdown(quote, segment.reference) : segment.source);
      }
    }
  } else {
    parts.push(...(await passageQuotes(item, translations, lookup)));
    if (item.note) parts.push(item.note);
    if (item.markdown) parts.push(item.markdown.trim());
  }
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}
