import { micromark } from "micromark";

import { decodeEntities } from "@/lib/study/html";

// The Markdown of reflections and notes, as HTML that is safe to print.
//
// micromark is CommonMark and safe unless told otherwise, and it is not told
// otherwise here: HTML written in the Markdown comes out as text, not as
// markup, and a link or an image whose address is not http(s), mailto or a
// path on this site loses its address. So nothing the writer types (or
// pastes) can put a script, a handler or a frame on the page.
export function renderMarkdown(markdown: string): string {
  return micromark(markdown);
}

// The rendered HTML without its blockquotes. Written HTML is escaped by
// renderMarkdown, so every "<blockquote" here is a real one.
function withoutBlockquotes(html: string): string {
  let depth = 0;
  let out = "";
  let last = 0;
  for (const tag of html.matchAll(/<(\/?)blockquote\b[^>]*>/g)) {
    if (depth === 0) out += html.slice(last, tag.index);
    depth = Math.max(0, depth + (tag[1] ? -1 : 1));
    last = tag.index + tag[0].length;
  }
  return depth === 0 ? out + html.slice(last) : out;
}

// The words alone, on one line, cut to about `limit` characters: for lists.
//
// `quotes: false` leaves every blockquote out, however deep, long or lazily
// continued: the HTML is cut where CommonMark itself says a quote begins and
// ends, so no line-level guess can leak a quote's words.
export function markdownExcerpt(
  markdown: string,
  limit = 160,
  { quotes = true } = {},
): string {
  // A block ends a word; an inline tag ("<strong>") does not.
  const html = (
    quotes
      ? renderMarkdown(markdown)
      : withoutBlockquotes(renderMarkdown(markdown))
  )
    .replace(
      /<\/?(?:p|h[1-6]|li|ul|ol|blockquote|pre|br|hr|table|tr|td|th)\b[^>]*>/g,
      " ",
    )
    .replace(/<[^>]+>/g, "");
  const text = decodeEntities(html).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text
    .slice(0, limit)
    .replace(/\s+\S*$/, "")
    .replace(/[\s,;:—–-]+$/, "")}…`;
}
