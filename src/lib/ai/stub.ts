import { EMBEDDING_DIMENSIONS, type AiProvider } from "./types";

export const STUB_EMBEDDING_DIMENSIONS = EMBEDDING_DIMENSIONS;
export const STUB_EMBEDDING_MODEL = "stub-words-1";

// FNV-1a, so the same text always seeds the same vector.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Words that say nothing about what a text means.
const STOP_WORDS = new Set(
  (
    "a about after all also am an and are as at be been but by can could did do does for from had " +
    "has have he her him his how i if in into is it its me my no not of on or our she shall so " +
    "than that the their them then there these they this those to up us was we were what when " +
    "which who will with would you your"
  ).split(" "),
);

// Enough stemming for "worries" to meet "worry" and "troubled" to meet "trouble".
export function stubWordStem(word: string): string {
  const stem = word
    .replace(/'s$/, "")
    .replace(/(?:ies|ied)$/, "y")
    .replace(/(?:ing|ed|es|s)$/, "");
  const base = stem.length >= 3 ? stem : word;
  return base.replace(/(?<=.{2})[ey]$/, "");
}

// Each word marks this many of the dimensions, so that two words that land on
// the same one are still strangers.
const DIMENSIONS_PER_WORD = 8;

// Hashed bag of words: each meaningful word adds to a few dimensions, so two
// texts are similar exactly as far as they share words. Stable and useful for
// asserting a result, and in no way semantic: "fear" and "afraid" are strangers.
function stubEmbedding(text: string, dimensions: number): number[] {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .filter((word) => !STOP_WORDS.has(word))
    .map(stubWordStem);
  const vector = new Array<number>(dimensions).fill(0);
  // Nothing to go on is still a direction, not a zero vector, which has no angle.
  for (const word of words.length > 0 ? words : [`#${text}`]) {
    for (let i = 0; i < DIMENSIONS_PER_WORD; i++) {
      const h = hash(`${i}:${word}`);
      vector[h % dimensions] += h & 0x80000000 ? 1 : -1;
    }
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

// Deterministic, offline provider for tests and `pnpm e2e:serve`. It never
// touches the network, so the same input always yields the same output.
export function createStubProvider(
  options: { dimensions?: number } = {},
): AiProvider {
  const dimensions = options.dimensions ?? STUB_EMBEDDING_DIMENSIONS;
  return {
    name: "stub",
    enabled: true,
    embeddingModel: STUB_EMBEDDING_MODEL,
    // Sharing a word with a long passage is a match, if a poor one; sharing
    // a dimension by chance is not.
    minSimilarity: 0.06,
    async complete(request) {
      const lastUserMessage = request.messages.findLast(
        (message) => message.role === "user",
      );
      return { text: `[stub] ${lastUserMessage?.content ?? ""}` };
    },
    async embed(texts) {
      return texts.map((text) => stubEmbedding(text, dimensions));
    },
  };
}
