import { describe, expect, it, vi } from "vitest";

import { AiDisabledError } from "./none";
import { EMBEDDING_DIMENSIONS } from "./types";
import {
  EmbeddingError,
  MAX_BATCH_CHARS,
  MAX_BATCH_TEXTS,
  VOYAGE_EMBEDDING_MODEL,
  batchTexts,
  createVoyageProvider,
} from "./voyage";

const KEY = "pa-test-key-do-not-print";

const vector = (seed = 0.5) => new Array<number>(EMBEDDING_DIMENSIONS).fill(seed);

const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

// Answers as Voyage does, one vector per input, numbered.
const answer = (input: string[]) =>
  reply({
    object: "list",
    data: input.map((_, index) => ({ object: "embedding", embedding: vector(index), index })),
    model: VOYAGE_EMBEDDING_MODEL,
    usage: { total_tokens: 1 },
  });

function setup(respond: (input: string[], attempt: number) => Response | Promise<Response>) {
  let attempt = 0;
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const { input } = JSON.parse(String(init?.body)) as { input: string[] };
    return respond(input, attempt++);
  });
  const sleep = vi.fn(async () => {});
  const provider = createVoyageProvider({ apiKey: KEY, fetch: fetch as typeof globalThis.fetch, sleep });
  return { fetch, sleep, provider };
}

describe("the Voyage provider", () => {
  it("asks for the pinned model, with the key, and gives back one vector per text", async () => {
    const { provider, fetch } = setup(answer);
    const vectors = await provider.embed(["one", "two"], { inputType: "document" });
    expect(vectors).toEqual([vector(0), vector(1)]);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      input: ["one", "two"],
      model: "voyage-4",
      input_type: "document",
      output_dimension: 1024,
    });
  });

  it("says what a search is for, and what the model is", async () => {
    const { provider, fetch } = setup(answer);
    await provider.embed(["peace"], { inputType: "query" });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).input_type).toBe("query");
    expect(provider.embeddingModel).toBe("voyage-4");
    expect(provider.enabled).toBe(true);
  });

  it("puts vectors in the order of the input, whatever order they come in", async () => {
    const { provider } = setup(() =>
      reply({ data: [{ embedding: vector(2), index: 1 }, { embedding: vector(1), index: 0 }] }),
    );
    expect(await provider.embed(["a", "b"])).toEqual([vector(1), vector(2)]);
  });

  it("makes no request for nothing", async () => {
    const { provider, fetch } = setup(answer);
    expect(await provider.embed([])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends long lists in batches and keeps them in order", async () => {
    const { provider, fetch } = setup((input) =>
      reply({ data: input.map((text, index) => ({ embedding: vector(Number(text)), index })) }),
    );
    const texts = Array.from({ length: MAX_BATCH_TEXTS * 2 + 1 }, (_, i) => String(i));
    const vectors = await provider.embed(texts);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vectors.map((each) => each[0])).toEqual(texts.map(Number));
  });

  it("keeps to a pace between requests", async () => {
    const { provider, sleep } = setup(answer);
    await provider.embed(new Array(MAX_BATCH_TEXTS + 1).fill("x"));
    expect(sleep).toHaveBeenCalled();
  });

  it("refuses a bad key at once, naming it, without quoting it", async () => {
    const { provider, fetch } = setup(() => reply({ detail: "Invalid key" }, { status: 401 }));
    const error = await provider.embed(["x"]).catch((caught) => caught);
    expect(error).toBeInstanceOf(EmbeddingError);
    expect(error.failure).toBe("key");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(`${error.message} ${error.stack}`).not.toContain(KEY);
  });

  it("does not retry a request Voyage cannot read", async () => {
    const { provider, fetch } = setup(() => reply({}, { status: 400 }));
    await expect(provider.embed(["x"])).rejects.toMatchObject({ failure: "request" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("waits out a 429 as long as Voyage says, then carries on", async () => {
    const { provider, fetch, sleep } = setup((input, attempt) =>
      attempt === 0 ? reply({}, { status: 429, headers: { "Retry-After": "7" } }) : answer(input),
    );
    expect(await provider.embed(["x"])).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it("backs off further with each failure, and retries a server error", async () => {
    const { provider, fetch, sleep } = setup((input, attempt) =>
      attempt < 3 ? reply({}, { status: 503 }) : answer(input),
    );
    expect(await provider.embed(["x"])).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    const waits = sleep.mock.calls.map(([ms]: number[]) => ms);
    expect(waits).toEqual(expect.arrayContaining([2000, 4000, 8000]));
  });

  it("gives up after its attempts, with the last reason", async () => {
    const { provider, fetch } = setup(() => reply({}, { status: 429 }));
    await expect(provider.embed(["x"], { inputType: "document" })).rejects.toMatchObject({ failure: "rate-limit" });
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it("does not keep a search waiting", async () => {
    const { provider, fetch } = setup(() => reply({}, { status: 500 }));
    await expect(provider.embed(["x"], { inputType: "query" })).rejects.toMatchObject({ failure: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("treats a network failure as unavailable, and retries it", async () => {
    const { provider, fetch } = setup((input, attempt) => {
      if (attempt === 0) throw new TypeError("fetch failed");
      return answer(input);
    });
    expect(await provider.embed(["x"])).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses an answer that is not what was asked for", async () => {
    const short = setup(() => reply({ data: [] }));
    await expect(short.provider.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
    const wrong = setup(() => reply({ data: [{ embedding: [1, 2, 3], index: 0 }] }));
    await expect(wrong.provider.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
    const garbled = setup(() => new Response("<html>", { status: 200 }));
    await expect(garbled.provider.embed(["x"])).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("does not answer questions: that is another provider's", async () => {
    const { provider } = setup(answer);
    await expect(provider.complete({ messages: [] })).rejects.toBeInstanceOf(AiDisabledError);
  });
});

describe("batchTexts", () => {
  it("stays within the count and the characters of a request", () => {
    const batches = batchTexts(new Array(MAX_BATCH_TEXTS + 2).fill("x"));
    expect(batches.map((batch) => batch.length)).toEqual([MAX_BATCH_TEXTS, 2]);
    const long = "y".repeat(MAX_BATCH_CHARS - 1);
    expect(batchTexts([long, long, "z"]).map((batch) => batch.length)).toEqual([1, 2]);
  });

  it("sends a text longer than a batch on its own", () => {
    const huge = "y".repeat(MAX_BATCH_CHARS * 2);
    expect(batchTexts(["a", huge, "b"]).map((batch) => batch.length)).toEqual([1, 1, 1]);
  });

  it("has nothing to batch in nothing", () => {
    expect(batchTexts([])).toEqual([]);
  });
});
