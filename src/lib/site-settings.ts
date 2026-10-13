// The shape of `site.settings` (jsonb). Types only, so the schema can import it.

export type SiteSettings = {
  ai?: {
    // Each is sealed with the install's settings key (src/lib/crypto/seal.ts):
    // the database holds ciphertext only. Read them with getAiKeys in
    // src/lib/ai/keys.ts, never directly.
    anthropicApiKey?: string;
    voyageApiKey?: string;
  };
};
