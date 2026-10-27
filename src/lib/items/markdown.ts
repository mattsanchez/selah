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

// The words alone, on one line, cut to about `limit` characters: for lists.
export function markdownExcerpt(markdown: string, limit = 160): string {
  // A block ends a word; an inline tag ("<strong>") does not.
  const html = renderMarkdown(markdown)
    .replace(/<\/?(?:p|h[1-6]|li|ul|ol|blockquote|pre|br|hr|table|tr|td|th)\b[^>]*>/g, " ")
    .replace(/<[^>]+>/g, "");
  const text = decodeEntities(html).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text
    .slice(0, limit)
    .replace(/\s+\S*$/, "")
    .replace(/[\s,;:—–-]+$/, "")}…`;
}
