import { seal, unseal } from "@/lib/crypto/seal";
import { settingsKey } from "@/lib/secrets";
import { getSite } from "@/lib/site";
import type { SiteSettings } from "@/lib/site-settings";

// The owner's API keys for the AI providers. Each comes from an environment
// variable or, failing that, from the site settings, where it is stored
// encrypted. Server-only: a key must never be passed to a client component,
// returned from a server action or logged.

export const AI_KEYS = {
  anthropic: {
    label: "Anthropic API key",
    env: "ANTHROPIC_API_KEY",
    setting: "anthropicApiKey",
  },
  voyage: {
    label: "Voyage AI API key",
    env: "VOYAGE_API_KEY",
    setting: "voyageApiKey",
  },
} as const;

export type AiKeyName = keyof typeof AI_KEYS;
export const AI_KEY_NAMES = Object.keys(AI_KEYS) as AiKeyName[];

type Env = Record<string, string | undefined>;

// Where a key comes from, which is all the settings page is told about it.
// "unreadable": one is saved, but it was encrypted with a different secret.
export type AiKeySource = "environment" | "saved" | "unreadable" | "none";

export function resolveAiKey(
  name: AiKeyName,
  settings: SiteSettings | undefined,
  key: Buffer,
  env: Env = process.env,
): { source: AiKeySource; value?: string } {
  const fromEnv = env[AI_KEYS[name].env]?.trim();
  if (fromEnv) return { source: "environment", value: fromEnv };
  const sealed = settings?.ai?.[AI_KEYS[name].setting];
  if (!sealed) return { source: "none" };
  const value = unseal(sealed, key);
  return value === undefined ? { source: "unreadable" } : { source: "saved", value };
}

// The keys to call the providers with; a provider without one is off.
export async function getAiKeys(): Promise<Partial<Record<AiKeyName, string>>> {
  const settings = (await getSite())?.settings;
  const key = settingsKey();
  const keys: Partial<Record<AiKeyName, string>> = {};
  for (const name of AI_KEY_NAMES) {
    const { value } = resolveAiKey(name, settings, key);
    if (value) keys[name] = value;
  }
  return keys;
}

export async function getAiKeySources(): Promise<Record<AiKeyName, AiKeySource>> {
  const settings = (await getSite())?.settings;
  const key = settingsKey();
  return Object.fromEntries(
    AI_KEY_NAMES.map((name) => [name, resolveAiKey(name, settings, key).source]),
  ) as Record<AiKeyName, AiKeySource>;
}

// Returns `settings` with the given keys changed: a string is sealed and
// saved, null removes the saved key, undefined leaves it as it is.
export function withAiKeys(
  settings: SiteSettings,
  changes: Partial<Record<AiKeyName, string | null>>,
  key: Buffer = settingsKey(),
): SiteSettings {
  const ai = { ...settings.ai };
  for (const name of AI_KEY_NAMES) {
    const change = changes[name];
    if (change === undefined) continue;
    if (change === null) delete ai[AI_KEYS[name].setting];
    else ai[AI_KEYS[name].setting] = seal(change, key);
  }
  return { ...settings, ai };
}
