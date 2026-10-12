import { describe, expect, it } from "vitest";

import {
  AiDisabledError,
  getAiProvider,
  resolveAiProviderName,
  STUB_EMBEDDING_DIMENSIONS,
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
});
