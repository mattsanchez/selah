export const AI_PROVIDER_NAMES = ["none", "stub"] as const;

export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiCompletionRequest = {
  system?: string;
  messages: AiMessage[];
};

export type AiCompletion = {
  text: string;
};

// The one seam every AI and embeddings call goes through. Application code asks
// `getAiProvider()` for an implementation and never imports a vendor SDK itself.
export interface AiProvider {
  readonly name: AiProviderName;
  // False when the install has no AI configured; callers hide AI features.
  readonly enabled: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
  embed(texts: string[]): Promise<number[][]>;
}
