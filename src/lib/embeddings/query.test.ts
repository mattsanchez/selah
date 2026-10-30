import { beforeEach, describe, expect, it, vi } from "vitest";

import { embedQuery, resetQueryCache } from "./query";

const provider = (embed = vi.fn(async (texts: string[]) => texts.map(() => [1, 0]))) => ({
  name: "voyage" as const,
  embeddingModel: "test-model",
  embed,
});

describe("embedQuery", () => {
  beforeEach(resetQueryCache);

  it("asks for a query vector", async () => {
    const stub = provider();
    expect(await embedQuery(stub, "peace")).toEqual([1, 0]);
    expect(stub.embed).toHaveBeenCalledWith(["peace"], { inputType: "query" });
  });

  it("asks once for a search repeated, as paging does", async () => {
    const stub = provider();
    await embedQuery(stub, "peace");
    await embedQuery(stub, "peace");
    expect(stub.embed).toHaveBeenCalledTimes(1);
  });

  it("does not share a cached vector between models", async () => {
    const stub = provider();
    await embedQuery(stub, "peace");
    await embedQuery({ ...stub, embeddingModel: "other" }, "peace");
    expect(stub.embed).toHaveBeenCalledTimes(2);
  });

  it("is undefined when the provider makes no embeddings", async () => {
    const stub = provider();
    expect(await embedQuery({ ...stub, embeddingModel: null }, "peace")).toBeUndefined();
    expect(stub.embed).not.toHaveBeenCalled();
  });

  it("is undefined, not an error, when the provider fails", async () => {
    const stub = provider(vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(embedQuery(stub, "peace")).resolves.toBeUndefined();
  });

  it("puts no limit on a provider that costs nothing", async () => {
    const stub = { ...provider(), name: "stub" as const };
    for (let i = 0; i < 80; i++) expect(await embedQuery(stub, `q${i}`, 1_000_000)).toBeDefined();
  });

  it("stops spending on new searches past the limit a minute, then starts again", async () => {
    const stub = provider();
    const now = 1_000_000;
    for (let i = 0; i < 60; i++) expect(await embedQuery(stub, `q${i}`, now)).toBeDefined();
    expect(await embedQuery(stub, "one too many", now)).toBeUndefined();
    expect(stub.embed).toHaveBeenCalledTimes(60);
    // One already asked still comes from the cache.
    expect(await embedQuery(stub, "q3", now)).toBeDefined();
    expect(await embedQuery(stub, "a minute later", now + 60_000)).toBeDefined();
  });
});
