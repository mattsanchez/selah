import { noneProvider } from "./none";
import { createStubProvider } from "./stub";
import {
  AI_PROVIDER_NAMES,
  type AiProvider,
  type AiProviderName,
} from "./types";

export { AiDisabledError } from "./none";
export { STUB_EMBEDDING_DIMENSIONS } from "./stub";
export type * from "./types";

type Env = Record<string, string | undefined>;

export function resolveAiProviderName(env: Env = process.env): AiProviderName {
  const value = env.AI_PROVIDER?.trim().toLowerCase();
  if (!value) return "none";
  if ((AI_PROVIDER_NAMES as readonly string[]).includes(value)) {
    return value as AiProviderName;
  }
  throw new Error(
    `Unknown AI_PROVIDER "${env.AI_PROVIDER}". Expected one of: ${AI_PROVIDER_NAMES.join(", ")}.`,
  );
}

// Selects the provider from AI_PROVIDER. Later milestones add the real
// providers here; tests and the e2e server always run with "stub".
export function getAiProvider(env: Env = process.env): AiProvider {
  switch (resolveAiProviderName(env)) {
    case "stub":
      return createStubProvider();
    case "none":
      return noneProvider;
  }
}
