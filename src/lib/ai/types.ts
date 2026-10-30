export const AI_PROVIDER_NAMES = ["none", "stub", "voyage"] as const;

export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

// How long every embedding vector is, whichever provider made it: the size of
// the `vector` columns in src/db/schema.ts. A number here and nowhere else.
export const EMBEDDING_DIMENSIONS = 1024;

// What a text is for. A provider may read a search differently from the
// documents it searches.
export type EmbedOptions = { inputType?: "query" | "document" };

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
  // The name stored with every vector this provider makes, or null when it
  // makes none. Vectors of two models cannot be compared, so a search only
  // reads the rows of the model it asked with.
  readonly embeddingModel: string | null;
  // Cosine similarity below which a vector is no match at all.
  readonly minSimilarity: number;
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
  // One unit-length vector per text, in order. Rejects when they cannot be
  // made; every caller treats that as having no embeddings.
  embed(texts: string[], options?: EmbedOptions): Promise<number[][]>;
}
