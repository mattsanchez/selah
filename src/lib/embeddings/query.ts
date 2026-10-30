import type { AiProvider } from "@/lib/ai/types";

// A search as a vector. Every failure here means "no vector": the caller
// searches by keyword and the visitor sees results, not an error.

const CACHE_SIZE = 200;
// A search page is public, and each new search is a paid call on the owner's
// key. Paging and repeating cost nothing (the cache); past this many new
// searches a minute, searches go by keyword.
const MAX_NEW_QUERIES_PER_MINUTE = 60;

const cache = new Map<string, number[]>();
let windowStart = 0;
let windowCount = 0;

// For tests.
export function resetQueryCache() {
  cache.clear();
  windowStart = 0;
  windowCount = 0;
}

function withinBudget(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  return ++windowCount <= MAX_NEW_QUERIES_PER_MINUTE;
}

export async function embedQuery(
  provider: Pick<AiProvider, "embed" | "embeddingModel"> & Partial<Pick<AiProvider, "name">>,
  text: string,
  now = Date.now(),
): Promise<number[] | undefined> {
  if (!provider.embeddingModel) return undefined;
  const key = `${provider.embeddingModel}\n${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // The stub costs nothing, and a test suite searches often.
  if (provider.name !== "stub" && !withinBudget(now)) return undefined;
  try {
    const [vector] = await provider.embed([text], { inputType: "query" });
    if (!vector) return undefined;
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, vector);
    return vector;
  } catch {
    return undefined;
  }
}
