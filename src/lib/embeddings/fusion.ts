import { rangesOverlap } from "@/lib/bible/ranges";
import type { VerseRange } from "@/lib/bible/verse-id";

// Reciprocal rank fusion: how two rankings become one. Keyword scores and
// vector distances are not on any common scale, but positions are: an item
// scores 1 / (k + position) in each list it is in, and the scores add up. An
// item both lists like beats one that only one list loves. 60 is the k of the
// paper that introduced the method (Cormack et al., 2009), and the usual default.
export const RRF_K = 60;

export const rrfScore = (position: number, k = RRF_K) => 1 / (k + position + 1);

// Several rankings of ids, best first, as one.
export function fuseRankings(rankings: readonly (readonly string[])[], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, position) => {
      scores.set(id, (scores.get(id) ?? 0) + rrfScore(position, k));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export type PassageKey = VerseRange & { translationId: string };

const sameText = (a: PassageKey, b: PassageKey) =>
  a.translationId === b.translationId && rangesOverlap(a, b);

// Keeps the best of windows that overlap: neighbours share verses, so they
// tend to rank together and say the same thing twice. Best first, in and out.
export function dropOverlaps<T extends PassageKey>(windows: readonly T[]): T[] {
  const kept: T[] = [];
  for (const window of windows) {
    if (!kept.some((other) => sameText(other, window))) kept.push(window);
  }
  return kept;
}

export type FusedPassage = PassageKey & { score: number; keyword: boolean; vector: boolean };

// Keyword hits (single verses) and vector hits (windows), each best first, as
// one list of passages. A verse inside a window counts for that window, which
// then stands for both, so it is not shown twice; of several verses in one
// window only the best counts. A verse no window found stays a verse.
export function fusePassages(
  verses: readonly { translationId: string; verseId: number }[],
  windows: readonly PassageKey[],
  k = RRF_K,
): FusedPassage[] {
  const passages: FusedPassage[] = dropOverlaps(windows).map((window, position) => ({
    translationId: window.translationId,
    start: window.start,
    end: window.end,
    score: rrfScore(position, k),
    keyword: false,
    vector: true,
  }));
  verses.forEach(({ translationId, verseId }, position) => {
    const verse = { translationId, start: verseId, end: verseId };
    const window = passages.find((passage) => sameText(passage, verse));
    if (!window) {
      passages.push({ ...verse, score: rrfScore(position, k), keyword: true, vector: false });
    } else if (!window.keyword) {
      window.keyword = true;
      window.score += rrfScore(position, k);
    }
  });
  return passages.sort((a, b) => b.score - a.score || a.start - b.start);
}
