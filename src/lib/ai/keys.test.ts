import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveAiKey, withAiKeys } from "./keys";

const key = randomBytes(32);

describe("AI keys", () => {
  it("stores keys sealed, never as typed", () => {
    const settings = withAiKeys({}, { anthropic: "sk-ant-123", voyage: "pa-456" }, key);
    expect(JSON.stringify(settings)).not.toContain("sk-ant-123");
    expect(JSON.stringify(settings)).not.toContain("pa-456");
    expect(resolveAiKey("anthropic", settings, key, {})).toEqual({
      source: "saved",
      value: "sk-ant-123",
    });
    expect(resolveAiKey("voyage", settings, key, {})).toEqual({ source: "saved", value: "pa-456" });
  });

  it("leaves a key alone, replaces it or removes it", () => {
    const saved = withAiKeys({}, { anthropic: "one", voyage: "two" }, key);
    const kept = withAiKeys(saved, {}, key);
    expect(kept.ai).toEqual(saved.ai);

    const changed = withAiKeys(saved, { anthropic: "three", voyage: null }, key);
    expect(resolveAiKey("anthropic", changed, key, {}).value).toBe("three");
    expect(resolveAiKey("voyage", changed, key, {})).toEqual({ source: "none" });
  });

  it("prefers the environment variable", () => {
    const saved = withAiKeys({}, { anthropic: "saved-key" }, key);
    expect(resolveAiKey("anthropic", saved, key, { ANTHROPIC_API_KEY: " env-key " })).toEqual({
      source: "environment",
      value: "env-key",
    });
    expect(resolveAiKey("voyage", saved, key, { VOYAGE_API_KEY: "v" }).source).toBe("environment");
    expect(resolveAiKey("voyage", undefined, key, {})).toEqual({ source: "none" });
  });

  it("reports a key sealed with another secret as unreadable", () => {
    const saved = withAiKeys({}, { anthropic: "saved-key" }, key);
    expect(resolveAiKey("anthropic", saved, randomBytes(32), {})).toEqual({ source: "unreadable" });
  });
});
