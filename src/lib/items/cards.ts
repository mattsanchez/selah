import { normalizeRanges, rangesOverlap } from "@/lib/bible/ranges";
import { formatReference, parseReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";

// Passage cards: how a reflection embeds scripture.
//
// A card is a line of the Markdown with nothing else on it, a reference in
// double square brackets, optionally followed by a translation:
//
//   [[John 3:16-18]]
//   [[Romans 8:28-30 | KJV]]
//   [[jn 3.16; 4:1-3|web]]
//
// - The reference is anything the reader's box takes (src/lib/bible/reference.ts).
// - The translation is the abbreviation or id of one that is loaded; without
//   one, or with one that is not loaded, the card is in the site's default.
// - The line starts at the margin. Inside a fenced code block (``` or ~~~)
//   it is code, and brackets in the middle of a sentence are just text.
//
// The page prints a card as the verses with their reference, translation and
// attribution; `item_passage` holds the verses of every card in the document
// (documentPassages below), rewritten on every save.

export type CardSegment = {
  type: "card";
  // The line as written.
  source: string;
  reference: string;
  translation?: string;
  // The verses, normalized; undefined when the reference does not parse.
  ranges?: VerseRange[];
  // Why not, in words for the writer.
  error?: string;
};

export type Segment = { type: "markdown"; text: string } | CardSegment;

const CARD = /^\[\[([^[\]|]+)(?:\|([^[\]|]*))?\]\][ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// The document as runs of Markdown and the cards between them, in order.
export function parseDocument(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.some((line) => line.trim())) segments.push({ type: "markdown", text: lines.join("\n") });
    lines = [];
  };
  // The marker that opened the code block we are in.
  let fence: string | undefined;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length).trim()) {
        fence = undefined;
      }
      lines.push(line);
      continue;
    }
    if (marker) {
      fence = marker;
      lines.push(line);
      continue;
    }
    const card = CARD.exec(line);
    if (!card || !card[1].trim()) {
      lines.push(line);
      continue;
    }
    flush();
    const reference = card[1].trim();
    const translation = card[2]?.trim() || undefined;
    const parsed = parseReference(reference);
    segments.push({
      type: "card",
      source: line.trimEnd(),
      reference,
      translation,
      ...(parsed.ok ? { ranges: normalizeRanges(parsed.ranges) } : { error: parsed.error.message }),
    });
  }
  flush();
  return segments;
}

type NamedTranslation = { id: string; abbrev: string };

// The loaded translation a card names, by abbreviation or id.
export function findTranslation<T extends NamedTranslation>(
  name: string | undefined,
  translations: readonly T[],
): T | undefined {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  return translations.find(
    (translation) => translation.id === wanted || translation.abbrev.toLowerCase() === wanted,
  );
}

// A card for these verses, as a line of Markdown.
export function passageCard(ranges: readonly VerseRange[], translation?: string): string {
  const reference = formatReference(normalizeRanges(ranges));
  return translation ? `[[${reference} | ${translation}]]` : `[[${reference}]]`;
}

// What `item_passage` holds for a document: the verses of all its cards as
// the fewest ranges, in reading order. Each range has the translation of the
// first card it comes from, when that card names a loaded one.
export function documentPassages(
  markdown: string,
  translations: readonly NamedTranslation[],
): (VerseRange & { translationId: string | null })[] {
  const cards = parseDocument(markdown).flatMap((segment) =>
    segment.type === "card" && segment.ranges ? [{ ...segment, ranges: segment.ranges }] : [],
  );
  return normalizeRanges(cards.flatMap((card) => card.ranges)).map((range) => {
    const from = cards.find((card) => card.ranges.some((own) => rangesOverlap(own, range)));
    return { ...range, translationId: findTranslation(from?.translation, translations)?.id ?? null };
  });
}
