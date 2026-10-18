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
  const text = decodeEntities(renderMarkdown(markdown).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}
