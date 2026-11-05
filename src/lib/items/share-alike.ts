import { SHARE_ALIKE_SOURCES, type ShareAlikeSource } from "@/lib/ask/sources";

// A quote from a share-alike source in a post. It is a blockquote that names
// the source (quoteNode in src/lib/ask/quote.ts), so the stored Markdown says
// by itself which posts have one and no column has to: its license stays with
// it wherever the post is printed, while the rest of the post stays the writer's.

const quoteBlocks = (markdown: string) => {
  const blocks: { lines: string[]; quote: boolean }[] = [];
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const quote = /^ {0,3}>/.test(line);
    const last = blocks.at(-1);
    if (last?.quote === quote) last.lines.push(line);
    else blocks.push({ lines: [line], quote });
  }
  return blocks;
};

const quoting = (lines: readonly string[], name: string) => lines.some((line) => line.includes(name));

// The share-alike sources a post's Markdown quotes.
export function shareAlikeQuotes(markdown: string | null | undefined): ShareAlikeSource[] {
  if (!markdown) return [];
  const quotes = quoteBlocks(markdown).filter((block) => block.quote);
  return SHARE_ALIKE_SOURCES.filter((source) => quotes.some((block) => quoting(block.lines, source.name)));
}

// The Markdown without those quotes: for excerpts, which have no room for
// what is owed to them.
export function withoutShareAlikeQuotes(markdown: string): string {
  return quoteBlocks(markdown)
    .filter((block) => !block.quote || !SHARE_ALIKE_SOURCES.some((source) => quoting(block.lines, source.name)))
    .flatMap((block) => block.lines)
    .join("\n");
}

// What is printed with such a post, in one sentence.
export const shareAlikeNotice = (source: ShareAlikeSource) =>
  `Quoted from ${source.name}, ${source.credit}, licensed ${source.license}. The rest of this post is the author’s own and is not under that license.`;
