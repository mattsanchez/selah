import { noneProvider } from "./none";
import { createStubProvider } from "./stub";
import { createVoyageProvider } from "./voyage";
import {
  AI_PROVIDER_NAMES,
  type AiProvider,
  type AiProviderName,
} from "./types";

export { AiDisabledError } from "./none";
export { STUB_EMBEDDING_DIMENSIONS, STUB_EMBEDDING_MODEL } from "./stub";
export { EMBEDDING_DIMENSIONS } from "./types";
export { VOYAGE_EMBEDDING_MODEL } from "./voyage";
export type * from "./types";

type Env = Record<string, string | undefined>;

// The keys that can turn a provider on, from getAiKeys() (src/lib/ai/keys.ts).
export type ProviderKeys = { voyage?: string };

// AI_PROVIDER decides when it is set: "stub" for tests, "none" to keep AI off
// whatever keys there are. Unset, a Voyage key turns on the real embeddings.
// A provider that needs a key it has not got is the same as none.
export function resolveAiProviderName(
  env: Env = process.env,
  keys: ProviderKeys = {},
): AiProviderName {
  const value = env.AI_PROVIDER?.trim().toLowerCase();
  const voyage = keys.voyage ?? env.VOYAGE_API_KEY?.trim();
  if (!value) return voyage ? "voyage" : "none";
  if ((AI_PROVIDER_NAMES as readonly string[]).includes(value)) {
    return value === "voyage" && !voyage ? "none" : (value as AiProviderName);
  }
  throw new Error(
    `Unknown AI_PROVIDER "${env.AI_PROVIDER}". Expected one of: ${AI_PROVIDER_NAMES.join(", ")}.`,
  );
}

// Selects the provider from AI_PROVIDER and the keys. Tests and the e2e server
// always run with "stub". Application code wants loadAiProvider()
// (src/lib/ai/load.ts), which also reads the keys saved in settings.
export function getAiProvider(env: Env = process.env, keys: ProviderKeys = {}): AiProvider {
  switch (resolveAiProviderName(env, keys)) {
    case "stub":
      return createStubProvider();
    case "voyage":
      return createVoyageProvider({ apiKey: keys.voyage ?? env.VOYAGE_API_KEY!.trim() });
    case "none":
      return noneProvider;
  }
}
