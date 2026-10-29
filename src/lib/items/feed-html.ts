import { layoutPassage, paragraphLines, type Inline } from "@/lib/bible/layout";

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

// Red letters as a feed reader may show them: most keep an inline color and
// drop classes.
const RED_LETTER = "color:#b91c1c";

function inlinesHtml(inlines: readonly Inline[]): string {
  return inlines
    .map((inline) =>
      inline.type !== "text"
        ? ""
        : inline.wordsOfJesus
          ? `<span class="words-of-jesus" style="${RED_LETTER}">${escapeHtml(inline.text)}</span>`
          : escapeHtml(inline.text),
    )
    .join("");
}

// The verses as the reader lays them out (layoutPassage): a paragraph for each
// paragraph, a line break between lines of poetry, red letters, and verse
// numbers when there is more than one verse. No headings or footnotes, as
// <PassageQuote> on the page.
function versesHtml(card: PassageCardView): string {
  const numbered = card.runs.flat().length > 1;
  const blocks = layoutPassage(card.runs).blocks.flatMap((block) => {
    if (block.type === "gap") return ["<p>…</p>"];
    if (block.type === "chapter") return [`<p><strong>${escapeHtml(block.label)}</strong></p>`];
    if (block.type === "heading") return [];
    const lines = paragraphLines(block.parts).map((line) =>
      line
        .map((part) =>
          part.join === "inline"
            ? " "
            : `${numbered && part.number !== undefined ? `<sup>${part.number}</sup>\u00a0` : ""}${inlinesHtml(part.inlines)}`,
        )
        .join(""),
    );
    return [`<p>${lines.join("<br/>")}</p>`];
  });
  if (card.more) blocks.push("<p>…</p>");
  return blocks.join("");
}

function cardHtml(card: PassageCardView, origin: string): string {
  const { translation } = card;
  const text =
    card.runs.length > 0
      ? versesHtml(card)
      : `<p>${escapeHtml(translation ? `Not in the ${translation.abbrev} as loaded here.` : "No translations are loaded.")}</p>`;
  const href = escapeHtml(`${origin}${card.href}`);
  const version = translation ? ` (${escapeHtml(translation.abbrev)})` : "";
  return `<blockquote>${text}<p>— <a href="${href}">${escapeHtml(card.reference)}</a>${version}</p></blockquote>`;
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
  const text = card.runs
    .map((verses) => verses.map((verse) => verse.text.replace(/\s+/g, " ").trim()).join(" "))
    .join(" … ");
  if (text.length <= limit) return card.more ? `${text} …` : text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}

// Verses in quotation marks, unless they open with their own: Psalm 46:10 is
// already a quotation ("“Be still, and know that I am God…”").
export function quoteVerses(text: string): string {
  return /^[“‘"']/.test(text) ? text : `“${text}”`;
}
