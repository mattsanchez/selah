import { and, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { passageEmbedding } from "@/db/schema";
import type { AiProvider } from "@/lib/ai/types";
import { getPassages } from "@/lib/bible/passage";
import { rangesOverlap } from "@/lib/bible/ranges";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { getCrossReferences } from "@/lib/study/queries";

import { RRF_K, dropOverlaps, rrfScore } from "./fusion";
import { nearestWindows, passageVector } from "./passages";

// Passages related to a passage: the windows nearest to it by vector, blended
// with its cross references. The list M11's "Suggest related passages" starts from.

export type RelatedSource = "meaning" | "cross-reference" | "keyword";

export type RelatedPassage = VerseRange & {
  // "Romans 8:28-30".
  reference: string;
  // The passage on one line, cut to about PREVIEW_CHARS, in the translation asked for.
  text: string;
  // Who put it on the list.
  sources: RelatedSource[];
};

export type RelatedResult = {
  passages: RelatedPassage[];
  // Whether vectors took part. False: cross references alone.
  meaning: boolean;
};

export type RelatedOptions = {
  // The translation to quote, and to compare in when it has vectors.
  translationId: string;
  limit?: number;
  provider?: Pick<AiProvider, "embeddingModel" | "minSimilarity">;
};

const PREVIEW_CHARS = 240;
// How many of each kind to weigh for one slot on the list.
const CANDIDATES_PER_SLOT = 4;

function preview(texts: readonly string[]): string {
  const text = texts.join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, "")}…`;
}

// A translation with vectors of this model: the one asked for, or else any,
// since verses are the same verses in every translation. Undefined when none has.
async function vectorTranslation(db: Db, model: string, translationId: string) {
  const row = async (only?: string) =>
    (
      await db
        .select({ id: passageEmbedding.translationId })
        .from(passageEmbedding)
        .where(and(eq(passageEmbedding.model, model), only ? eq(passageEmbedding.translationId, only) : undefined))
        .limit(1)
    )[0]?.id;
  return (await row(translationId)) ?? (await row());
}

type Ranked = VerseRange & { score: number; sources: RelatedSource[] };

// One list from windows and cross references, each best first. Where a cross
// reference overlaps a window the two are one suggestion, on the verses the
// cross reference names, since those were chosen by people.
export function blendRelated(
  windows: readonly VerseRange[],
  crossReferences: readonly VerseRange[],
  k = RRF_K,
): Ranked[] {
  const ranked: Ranked[] = windows.map((window, position) => ({
    start: window.start,
    end: window.end,
    score: rrfScore(position, k),
    sources: ["meaning"],
  }));
  crossReferences.forEach((reference, position) => {
    const same = ranked.find((entry) => rangesOverlap(entry, reference));
    if (!same) {
      ranked.push({ ...reference, score: rrfScore(position, k), sources: ["cross-reference"] });
    } else if (!same.sources.includes("cross-reference")) {
      same.start = reference.start;
      same.end = reference.end;
      same.score += rrfScore(position, k);
      same.sources.push("cross-reference");
    }
  });
  return ranked.sort((a, b) => b.score - a.score || a.start - b.start);
}

// What is related to `range`: never the range itself, nor (with vectors) the
// verses right around it, which are always close and rarely a discovery.
// Without vectors for this model, its cross references alone.
export async function relatedPassages(
  db: Db,
  range: VerseRange,
  { translationId, limit = 6, provider }: RelatedOptions,
): Promise<RelatedResult> {
  const candidates = limit * CANDIDATES_PER_SLOT;
  const model = provider?.embeddingModel;
  const comparedIn = model ? await vectorTranslation(db, model, translationId) : undefined;
  const source = model && comparedIn ? await passageVector(db, model, comparedIn, range) : undefined;

  const windows =
    model && comparedIn && source
      ? await nearestWindows(db, source.vector, {
          model,
          translationIds: [comparedIn],
          except: source.reach,
          minSimilarity: provider.minSimilarity,
          limit: candidates,
        })
      : [];

  const crossReferences = await getCrossReferences(db, range, { limit: candidates });
  const targets = dropOverlaps(
    crossReferences
      .map((row) => ({ translationId, start: row.toStart, end: row.toEnd }))
      .filter((target) => !rangesOverlap(target, range)),
  );

  const ranked = blendRelated(dropOverlaps(windows), targets);
  // Over-read: a cross reference may be to verses this translation lacks.
  const texts = (await getPassages(db, [translationId], ranked)).get(translationId) ?? [];
  const passages = ranked
    .flatMap((entry, i) => {
      const text = preview((texts[i] ?? []).map((verse) => verse.text));
      if (!text) return [];
      const { start, end, sources } = entry;
      return [{ start, end, reference: formatReference([{ start, end }]), text, sources }];
    })
    .slice(0, limit);
  return { passages, meaning: windows.length > 0 };
}
