import { AiDisabledError } from "./none";
import { EMBEDDING_DIMENSIONS, type AiProvider, type EmbedOptions } from "./types";

// Embeddings from Voyage AI over its REST API (Claude has no embeddings
// endpoint). Only `embed` works: answers are Claude's (src/lib/ai/claude.ts),
// and getAiProvider() puts the two together on an install with both keys.
//
// A vector is only comparable with vectors of the same model, so this name is
// stored with every one of them. Changing it makes every stored vector stale:
// `pnpm embed:bible` then embeds everything again, at the cost in the README.
export const VOYAGE_EMBEDDING_MODEL = "voyage-4";

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

// Voyage allows 1,000 texts and 320,000 tokens a request for this model. These
// stay far below, so a request is one small unit of progress and an account
// with low limits still gets through; about four characters make a token.
export const MAX_BATCH_TEXTS = 128;
export const MAX_BATCH_CHARS = 24_000;

// Cosine similarity below which a passage is not about the query. Not
// calibrated against real data: a judgement from how Voyage's models score
// unrelated English texts. Ranking does not depend on it, only where a list
// of results stops.
const MIN_SIMILARITY = 0.35;

// A search waits for an answer; a background job can afford patience.
const QUERY = { attempts: 2, timeoutMs: 5_000 };
const DOCUMENT = { attempts: 7, timeoutMs: 60_000 };

const BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

// The gap between requests. It widens on every 429 and narrows again as
// requests succeed, so the pace finds whatever the account's limit is.
const MIN_GAP_MS = 200;
const MAX_GAP_MS = 60_000;

export type EmbeddingFailure = "key" | "request" | "rate-limit" | "unavailable";

export class EmbeddingError extends Error {
  constructor(
    readonly failure: EmbeddingFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

// Cuts texts into requests of at most MAX_BATCH_TEXTS and MAX_BATCH_CHARS, in order.
export function batchTexts(texts: readonly string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (current.length >= MAX_BATCH_TEXTS || (current.length > 0 && chars + text.length > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function retryAfterMs(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

// The vectors of a response body, in the order of the input.
function parseEmbeddings(body: unknown, count: number): number[][] {
  const data = (body as { data?: { embedding?: number[]; index?: number }[] } | null)?.data;
  if (!Array.isArray(data) || data.length !== count) {
    throw new EmbeddingError("unavailable", "Voyage AI's answer was not one vector per text.");
  }
  const vectors = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => row.embedding);
  if (vectors.some((vector) => vector?.length !== EMBEDDING_DIMENSIONS)) {
    throw new EmbeddingError("unavailable", `Voyage AI's vectors were not ${EMBEDDING_DIMENSIONS} long.`);
  }
  return vectors as number[][];
}

type VoyageOptions = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Never logs or returns the key, and an error never quotes a request.
export function createVoyageProvider({
  apiKey,
  fetch: send = globalThis.fetch,
  sleep = wait,
}: VoyageOptions): AiProvider {
  let gap = MIN_GAP_MS;
  let lastRequest = 0;

  async function pace() {
    const left = lastRequest + gap - Date.now();
    if (left > 0) await sleep(left);
    lastRequest = Date.now();
  }

  async function request(input: string[], inputType: EmbedOptions["inputType"]): Promise<number[][]> {
    const { attempts, timeoutMs } = inputType === "query" ? QUERY : DOCUMENT;
    let failure: EmbeddingError | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(Math.min(BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS));
      await pace();
      let response: Response;
      try {
        response = await send(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            model: VOYAGE_EMBEDDING_MODEL,
            input_type: inputType ?? "document",
            output_dimension: EMBEDDING_DIMENSIONS,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        failure = new EmbeddingError("unavailable", "Voyage AI could not be reached.", { cause });
        continue;
      }
      if (response.ok) {
        gap = Math.max(MIN_GAP_MS, gap * 0.9);
        return parseEmbeddings(await response.json().catch(() => null), input.length);
      }
      if (response.status === 401 || response.status === 403) {
        throw new EmbeddingError("key", "Voyage AI refused the API key.");
      }
      if (response.status === 429) {
        gap = Math.min(MAX_GAP_MS, gap * 2);
        const after = retryAfterMs(response);
        if (after) await sleep(Math.min(after, MAX_BACKOFF_MS));
        failure = new EmbeddingError("rate-limit", "Voyage AI's rate limit was reached.");
        continue;
      }
      if (response.status >= 500) {
        failure = new EmbeddingError("unavailable", `Voyage AI answered ${response.status}.`);
        continue;
      }
      throw new EmbeddingError("request", `Voyage AI refused the request (${response.status}).`);
    }
    throw failure!;
  }

  return {
    name: "voyage",
    enabled: true,
    embeddingModel: VOYAGE_EMBEDDING_MODEL,
    minSimilarity: MIN_SIMILARITY,
    answerModel: null,
    async complete() {
      throw new AiDisabledError();
    },
    async *stream() {
      throw new AiDisabledError();
    },
    async embed(texts, { inputType } = {}) {
      const vectors: number[][] = [];
      for (const batch of batchTexts(texts)) vectors.push(...(await request(batch, inputType)));
      return vectors;
    },
  };
}
