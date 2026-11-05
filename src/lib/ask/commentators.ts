import type { Db } from "@/db/client";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { getPassages } from "@/lib/bible/passage";
import { readerPath } from "@/lib/reader-url";

import { askCommentary, entryText } from "./context";
import { QUOTE_MAX_WORDS, makeQuote, type SourceQuote } from "./quote";
import { contentWords } from "./words";

// "What do commentators say": a short passage of each commentator on these
// verses, word for word from the source. No model is asked, so nothing here
// costs a question or can be made up.

// The sentence or two of a text with the most of these words, at most
// QUOTE_MAX_WORDS. Anything left out, before or after, is marked.
export function pickQuote(text: string, words: readonly string[]): { text: string; shortened: boolean } {
  const wanted = new Set(words);
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?;])\s+(?=["“‘(]?[A-Z])/);
  const size = (sentence: string) => sentence.split(" ").length;
  let best = 0;
  let bestScore = -1;
  sentences.forEach((sentence, i) => {
    const score = contentWords(sentence).filter((word) => wanted.has(word)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  const kept = [sentences[best]];
  for (let i = best + 1; i < sentences.length; i++) {
    if (kept.reduce((sum, each) => sum + size(each), 0) + size(sentences[i]) > QUOTE_MAX_WORDS) break;
    kept.push(sentences[i]);
  }
  let body = kept.join(" ");
  const tooLong = size(body) > QUOTE_MAX_WORDS;
  if (tooLong) body = body.split(" ").slice(0, QUOTE_MAX_WORDS).join(" ");
  const before = best > 0;
  const after = tooLong || best + kept.length < sentences.length;
  return { text: `${before ? "[…] " : ""}${body}${after ? " […]" : ""}`, shortened: before || after };
}

export async function commentatorCards(
  db: Db,
  ranges: readonly VerseRange[],
  { translationId, t }: { translationId: string; t?: string },
): Promise<SourceQuote[]> {
  const [groups, passages] = await Promise.all([
    askCommentary(db, ranges),
    getPassages(db, [translationId], ranges),
  ]);
  const words = contentWords((passages.get(translationId) ?? []).flat().map((verse) => verse.text).join(" "));
  return groups.flatMap(({ source, entries }) => {
    const [entry] = entries;
    const text = entry && entryText(entry.html);
    if (!text) return [];
    const range = { start: entry.verseStart, end: entry.verseEnd };
    return [
      makeQuote(source, { reference: formatReference([range]), href: readerPath([range], t) }, pickQuote(text, words)),
    ];
  });
}
