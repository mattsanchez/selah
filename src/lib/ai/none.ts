import type { AiProvider } from "./types";

export class AiDisabledError extends Error {
  constructor() {
    super("AI is not configured for this install (AI_PROVIDER is \"none\").");
    this.name = "AiDisabledError";
  }
}

// AI is off until the owner configures a provider; everything else works without it.
export const noneProvider: AiProvider = {
  name: "none",
  enabled: false,
  async complete() {
    throw new AiDisabledError();
  },
  async embed() {
    throw new AiDisabledError();
  },
};
