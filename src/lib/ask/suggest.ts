import type { Db } from "@/db/client";
import type { AiProvider } from "@/lib/ai/types";
import { getPassages } from "@/lib/bible/passage";
import { rangesOverlap } from "@/lib/bible/ranges";
import { formatReference } from "@/lib/bible/reference";
import { searchVerses } from "@/lib/bible/search";
import type { VerseRange } from "@/lib/bible/verse-id";
import { relatedPassages, type RelatedResult } from "@/lib/embeddings/related";

import { anyOf } from "./words";

const SUGGESTIONS = 6;

// "Suggest related passages": what is related to these verses, by meaning and
// cross reference; when that is short of a full list, passages that share
// their words. No model is asked.
export async function suggestPassages(
  db: Db,
  ranges: readonly VerseRange[],
  { translationId, provider }: { translationId: string; provider: Pick<AiProvider, "embeddingModel" | "minSimilarity"> },
): Promise<RelatedResult> {
  const span = { start: ranges[0].start, end: ranges.at(-1)!.end };
  const related = await relatedPassages(db, span, { translationId, limit: SUGGESTIONS, provider });
  if (related.passages.length >= SUGGESTIONS) return related;

  const text = (await getPassages(db, [translationId], ranges)).get(translationId)?.flat() ?? [];
  const query = anyOf(text.map((verse) => verse.text).join(" "));
  const { hits } = query ? await searchVerses(db, { query, translationIds: [translationId], limit: SUGGESTIONS * 3 }) : { hits: [] };
  const taken = [...ranges, ...related.passages];
  const shared = hits.flatMap((hit) => {
    const range = { start: hit.verseId, end: hit.verseId };
    if (taken.some((own) => rangesOverlap(own, range))) return [];
    taken.push(range);
    return [
      {
        ...range,
        reference: formatReference([range]),
        text: hit.text.map((segment) => segment.text).join("").replace(/\s+/g, " ").trim(),
        sources: ["keyword" as const],
      },
    ];
  });
  return { ...related, passages: [...related.passages, ...shared].slice(0, SUGGESTIONS) };
}
