import { describe, expect, it } from "vitest";

import {
  AiDisabledError,
  CLAUDE_ANSWER_MODEL,
  STUB_ANSWER_MODEL,
  getAiProvider,
  resolveAiProviderName,
  STUB_EMBEDDING_DIMENSIONS,
  STUB_EMBEDDING_MODEL,
  VOYAGE_EMBEDDING_MODEL,
} from "./index";

describe("resolveAiProviderName", () => {
  it("defaults to none when AI_PROVIDER is unset or blank", () => {
    expect(resolveAiProviderName({})).toBe("none");
    expect(resolveAiProviderName({ AI_PROVIDER: "  " })).toBe("none");
  });

  it("accepts known names regardless of case and whitespace", () => {
    expect(resolveAiProviderName({ AI_PROVIDER: " Stub " })).toBe("stub");
  });

  it("rejects unknown names instead of silently falling back", () => {
    expect(() => resolveAiProviderName({ AI_PROVIDER: "anthropic" })).toThrow(
      /Unknown AI_PROVIDER "anthropic"/,
    );
  });
});

describe("choosing a provider by key", () => {
  it("turns on Voyage when AI_PROVIDER is unset and there is a key, from either place", () => {
    expect(resolveAiProviderName({ VOYAGE_API_KEY: "pa-env" })).toBe("voyage");
    expect(resolveAiProviderName({}, { voyage: "pa-saved" })).toBe("voyage");
    expect(getAiProvider({}, { voyage: "pa-saved" }).embeddingModel).toBe(VOYAGE_EMBEDDING_MODEL);
  });

  it("has no provider without a key", () => {
    expect(resolveAiProviderName({ VOYAGE_API_KEY: "  " })).toBe("none");
    expect(resolveAiProviderName({ AI_PROVIDER: "voyage" })).toBe("none");
    expect(getAiProvider({ AI_PROVIDER: "voyage" }).embeddingModel).toBeNull();
  });

  it("lets AI_PROVIDER win over any key", () => {
    expect(resolveAiProviderName({ AI_PROVIDER: "stub", VOYAGE_API_KEY: "pa" })).toBe("stub");
    expect(resolveAiProviderName({ AI_PROVIDER: "none" }, { voyage: "pa" })).toBe("none");
    expect(resolveAiProviderName({ AI_PROVIDER: "voyage" }, { voyage: "pa" })).toBe("voyage");
  });
});

describe("Claude and Voyage together", () => {
  const keys = { anthropic: "sk-ant-test", voyage: "pa-test" };

  it("has either, both or neither, by key", () => {
    expect(resolveAiProviderName({}, { anthropic: "sk-ant-test" })).toBe("claude");
    expect(resolveAiProviderName({ ANTHROPIC_API_KEY: "sk-ant-test" })).toBe("claude");
    expect(resolveAiProviderName({}, keys)).toBe("claude+voyage");
    expect(resolveAiProviderName({}, {})).toBe("none");
  });

  it("answers with Claude and embeds with Voyage when it has both", () => {
    const provider = getAiProvider({}, keys);
    expect(provider.answerModel).toBe(CLAUDE_ANSWER_MODEL);
    expect(provider.embeddingModel).toBe(VOYAGE_EMBEDDING_MODEL);
  });

  it("does not answer with Voyage alone, nor embed with Claude alone", () => {
    expect(getAiProvider({}, { voyage: "pa" }).answerModel).toBeNull();
    expect(getAiProvider({}, { anthropic: "sk" }).embeddingModel).toBeNull();
  });

  it("lets AI_PROVIDER win over keys, and treats a provider without its key as none", () => {
    expect(getAiProvider({ AI_PROVIDER: "stub" }, keys).answerModel).toBe(STUB_ANSWER_MODEL);
    expect(getAiProvider({ AI_PROVIDER: "none" }, keys).enabled).toBe(false);
    expect(resolveAiProviderName({ AI_PROVIDER: "claude" })).toBe("none");
    expect(getAiProvider({ AI_PROVIDER: "voyage" }, keys).answerModel).toBeNull();
    expect(getAiProvider({ AI_PROVIDER: "claude" }, keys).embeddingModel).toBeNull();
  });

  it("never holds a key where it could be serialized", () => {
    expect(JSON.stringify(getAiProvider({}, keys))).not.toContain("test");
  });
});

describe("none provider", () => {
  it("is disabled and refuses calls", async () => {
    const provider = getAiProvider({});
    expect(provider.enabled).toBe(false);
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(AiDisabledError);
    await expect(provider.embed(["hi"])).rejects.toBeInstanceOf(
      AiDisabledError,
    );
  });
});

describe("stub provider", () => {
  const provider = getAiProvider({ AI_PROVIDER: "stub" });

  it("answers a question from its context, in the contract's two sections, in pieces", async () => {
    const content =
      `<context><item id="43003016" kind="passage" ref="John 3:16" translation="BSB">For God so loved the world</item>\n` +
      `<item id="c1" kind="study-note" source="Tyndale Open Study Notes (Protestant evangelical tradition)" on="John 3:16" license="CC BY-SA 4.0">God gave his Son</item></context>\n` +
      `<question>Why?</question>`;
    const pieces: string[] = [];
    for await (const piece of provider.stream({ messages: [{ role: "user", content }] })) pieces.push(piece);
    const text = pieces.join("");
    expect(pieces.length).toBeGreaterThan(3);
    expect(text).toBe((await provider.complete({ messages: [{ role: "user", content }] })).text);
    expect(text).toContain("## What the text says");
    expect(text).toContain("## Interpretation");
    expect(text).toContain("[[43003016]]");
    expect(text).toContain('<quote source="c1">God gave his Son</quote>');
  });

  it("echoes the last user message", async () => {
    const completion = await provider.complete({
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "What does John 3:16 say?" },
      ],
    });
    expect(completion.text).toBe("[stub] What does John 3:16 say?");
  });

  it("returns deterministic unit vectors, one per input", async () => {
    const [a, b] = await provider.embed(["living water", "anxiety"]);
    const [again] = await provider.embed(["living water"]);

    expect(a).toHaveLength(STUB_EMBEDDING_DIMENSIONS);
    expect(again).toEqual(a);
    expect(b).not.toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1, 6);
  });

  it("names its model, so its vectors are never read as a real model's", () => {
    expect(provider.embeddingModel).toBe(STUB_EMBEDDING_MODEL);
  });

  const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

  it("makes texts similar as far as they share words, word forms included", async () => {
    const [query, close, far] = await provider.embed([
      "worried and troubled hearts",
      "Do not let your hearts be troubled; do not worry.",
      "The genealogy of the kings of Judah",
    ]);
    expect(cosine(query, close)).toBeGreaterThan(0.5);
    expect(cosine(query, far)).toBeCloseTo(0, 1);
  });

  it("is not semantic: words it has not seen together are strangers", async () => {
    const [a, b] = await provider.embed(["fear", "afraid"]);
    expect(cosine(a, b)).toBeCloseTo(0, 5);
  });

  it("still gives a direction to text with no words in it", async () => {
    const [vector] = await provider.embed(["the of and"]);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  });
});
