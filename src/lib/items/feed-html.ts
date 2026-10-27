import { parseVerseId } from "@/lib/bible/verse-id";

import type { FeedEntry, PassageCardView } from "./feed";

// An item as one string of HTML, for the RSS and Atom feeds: what
// <FeedItem> (src/components/items/feed-item.tsx) shows, without the page
// around it. Every link is absolute, since a feed reader shows it away from
// the site.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Links and images to paths on this site, made absolute. The Markdown's HTML
// comes from micromark, which quotes every attribute with double quotes.
export function absoluteLinks(html: string, origin: string): string {
  return html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${origin}/`);
}

function cardHtml(card: PassageCardView, origin: string): string {
  const { translation, runs } = card;
  const numbered = runs.flat().length > 1;
  const text =
    runs.length > 0
      ? runs
          .map((verses) =>
            verses
              .map(
                (verse) =>
                  `${numbered ? `<sup>${parseVerseId(verse.verseId)?.verse ?? ""}</sup> ` : ""}${escapeHtml(verse.text)}`,
              )
              .join(" "),
          )
          .join(" … ") + (card.more ? " …" : "")
      : escapeHtml(translation ? `Not in the ${translation.abbrev} as loaded here.` : "No translations are loaded.");
  const href = escapeHtml(`${origin}${card.href}`);
  const version = translation ? ` (${escapeHtml(translation.abbrev)})` : "";
  return `<blockquote><p>${text}</p><p>— <a href="${href}">${escapeHtml(card.reference)}</a>${version}</p></blockquote>`;
}

export function entryHtml(entry: FeedEntry, origin: string): string {
  const { item, passage, blocks, translations } = entry;
  const parts: string[] = [];
  if (passage) parts.push(cardHtml(passage, origin));
  if (item.kind === "highlight" && item.note) parts.push(`<p>${escapeHtml(item.note)}</p>`);
  for (const block of blocks) {
    if (block.type === "html") parts.push(absoluteLinks(block.html, origin));
    else if (block.type === "card") parts.push(cardHtml(block.card, origin));
    else parts.push(`<p>${escapeHtml(block.source)}</p>`);
  }
  for (const translation of translations) {
    parts.push(
      `<p><small>${escapeHtml(translation.attribution)} <a href="${escapeHtml(translation.sourceUrl)}">Source</a></small></p>`,
    );
  }
  return parts.join("\n");
}

// A card's verses as one line of plain text, cut to about `limit` characters
// between words: for descriptions and images.
export function cardText(card: PassageCardView, limit = 280): string {
  const text = card.runs.map((verses) => verses.map((verse) => verse.text).join(" ")).join(" … ");
  if (text.length <= limit) return card.more ? `${text} …` : text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}
