import type { AiProvider } from "./types";

export const STUB_EMBEDDING_DIMENSIONS = 1024;

// FNV-1a, so the same text always seeds the same vector.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stubEmbedding(text: string, dimensions: number): number[] {
  const next = prng(hash(text));
  const vector = Array.from({ length: dimensions }, () => next() * 2 - 1);
  const norm = Math.hypot(...vector);
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
