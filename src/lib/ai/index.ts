import { createClaudeProvider } from "./claude";
import { noneProvider } from "./none";
import { createStubProvider } from "./stub";
import { createVoyageProvider } from "./voyage";
import {
  AI_PROVIDER_NAMES,
  type AiProvider,
  type AiProviderName,
} from "./types";

export { CLAUDE_ANSWER_MODEL, CLAUDE_SMALL_MODEL, ClaudeError, type ClaudeFailure } from "./claude";
export { AiDisabledError } from "./none";
export { STUB_ANSWER_MODEL, STUB_EMBEDDING_DIMENSIONS, STUB_EMBEDDING_MODEL } from "./stub";
export { EMBEDDING_DIMENSIONS } from "./types";
export { VOYAGE_EMBEDDING_MODEL } from "./voyage";
export type * from "./types";

type Env = Record<string, string | undefined>;

// The keys that can turn a provider on, from getAiKeys() (src/lib/ai/keys.ts).
export type ProviderKeys = { anthropic?: string; voyage?: string };

// Which of the two real providers have a key.
const keyed = (env: Env, keys: ProviderKeys) => ({
  claude: keys.anthropic ?? env.ANTHROPIC_API_KEY?.trim(),
  voyage: keys.voyage ?? env.VOYAGE_API_KEY?.trim(),
});

// AI_PROVIDER decides when it is set: "stub" for tests, "none" to keep AI off
// whatever keys there are, "claude" or "voyage" for that provider alone.
// Unset, each key turns on its provider: either, both or neither. A provider
// that needs a key it has not got is the same as none.
export function resolveAiProviderName(
  env: Env = process.env,
  keys: ProviderKeys = {},
): AiProviderName {
  const value = env.AI_PROVIDER?.trim().toLowerCase();
  const { claude, voyage } = keyed(env, keys);
  if (!value) return claude && voyage ? "claude+voyage" : claude ? "claude" : voyage ? "voyage" : "none";
  if ((AI_PROVIDER_NAMES as readonly string[]).includes(value)) {
    if (value === "voyage" && !voyage) return "none";
    if (value === "claude" && !claude) return "none";
    if (value === "claude+voyage" && !(claude && voyage)) return "none";
    return value as AiProviderName;
  }
  throw new Error(
    `Unknown AI_PROVIDER "${env.AI_PROVIDER}". Expected one of: ${AI_PROVIDER_NAMES.join(", ")}.`,
  );
}

// Answers from one provider, embeddings from the other.
function composeProviders(answers: AiProvider, embeddings: AiProvider): AiProvider {
  return {
    name: "claude+voyage",
    enabled: true,
    embeddingModel: embeddings.embeddingModel,
    minSimilarity: embeddings.minSimilarity,
    answerModel: answers.answerModel,
    complete: answers.complete,
    stream: answers.stream,
    embed: embeddings.embed,
  };
}

// Selects the provider from AI_PROVIDER and the keys. Tests and the e2e server
// always run with "stub". Application code wants loadAiProvider()
// (src/lib/ai/load.ts), which also reads the keys saved in settings.
export function getAiProvider(env: Env = process.env, keys: ProviderKeys = {}): AiProvider {
  const { claude, voyage } = keyed(env, keys);
  switch (resolveAiProviderName(env, keys)) {
    case "stub":
      return createStubProvider({ chunkDelayMs: env.AI_STUB_CHUNK_DELAY_MS ? Number(env.AI_STUB_CHUNK_DELAY_MS) : 0 });
    case "voyage":
      return createVoyageProvider({ apiKey: voyage! });
    case "claude":
      return createClaudeProvider({ apiKey: claude! });
    case "claude+voyage":
      return composeProviders(createClaudeProvider({ apiKey: claude! }), createVoyageProvider({ apiKey: voyage! }));
    case "none":
      return noneProvider;
  }
}
