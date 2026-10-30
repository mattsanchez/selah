import { EMBEDDING_DIMENSIONS, type AiCompletionRequest, type AiProvider } from "./types";

export const STUB_EMBEDDING_DIMENSIONS = EMBEDDING_DIMENSIONS;
export const STUB_EMBEDDING_MODEL = "stub-words-1";
export const STUB_ANSWER_MODEL = "stub-answers-1";

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
export const STOP_WORDS = new Set(
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

const STUB_ITEM = /<item id="([^"]+)" kind="([^"]+)"(?: source="([^"]*)")?[^>]*>([\s\S]*?)<\/item>/g;

const firstWords = (text: string, count: number) => text.replace(/\s+/g, " ").trim().split(" ").slice(0, count).join(" ");

// A canned answer to a question put with its context (src/lib/ask/prompt.ts),
// in the shape the prompt asks of Claude: it says each of the first verses
// back, and quotes the first two commentators word for word. It reads nothing
// and means nothing; it is here so tests can see every part of an answer.
// A question with "outside the context" in it cites a verse that is not there,
// which the app must not link.
function stubAnswer(prompt: string, question: string): string {
  const items = [...prompt.matchAll(STUB_ITEM)].map(([, id, kind, source, text]) => ({ id, kind, source, text }));
  const verses = items.filter((item) => item.kind === "passage").slice(0, 2);
  const others = items.filter((item) => item.kind === "cross-reference").slice(0, 1);
  const quoted = items.filter((item) => item.kind === "commentary" || item.kind === "study-note");
  const read = verses.map((item) => `“${firstWords(item.text, 10)}” [[${item.id}]]`).join(" and ");
  const also = others.map((item) => ` See also [[${item.id}]].`).join("");
  const outside = /outside the context/i.test(question) ? " Compare [[66022021]]." : "";
  const quotes = [...quoted.slice(0, 1), ...quoted.filter((item) => item.kind === "study-note").slice(0, 1)]
    .map((item) => `\n\n${item.source} writes:\n\n<quote source="${item.id}">${firstWords(item.text, 14)}</quote>`)
    .join("");
  return [
    "## What the text says",
    "",
    `This is a canned test answer. The passage reads ${read || "nothing here"}.${also}${outside}`,
    "",
    "## Interpretation",
    "",
    `Readers differ on this, and the text alone does not settle it.${quotes}`,
    "",
  ].join("\n");
}

function stubText(request: AiCompletionRequest): string {
  const last = request.messages.findLast((message) => message.role === "user")?.content ?? "";
  const question = /<question>([\s\S]*?)<\/question>/.exec(last);
  return question ? stubAnswer(last, question[1]) : `[stub] ${last}`;
}

const STUB_CHUNK_CHARS = 24;

// Deterministic, offline provider for tests and `pnpm e2e:serve`. It never
// touches the network, so the same input always yields the same output.
// `chunkDelayMs` spaces out what it streams, so a page can be seen filling.
export function createStubProvider(
  options: { dimensions?: number; chunkDelayMs?: number } = {},
): AiProvider {
  const dimensions = options.dimensions ?? STUB_EMBEDDING_DIMENSIONS;
  const delay = options.chunkDelayMs ?? 0;
  return {
    name: "stub",
    enabled: true,
    embeddingModel: STUB_EMBEDDING_MODEL,
    // Sharing a word with a long passage is a match, if a poor one; sharing
    // a dimension by chance is not.
    minSimilarity: 0.06,
    answerModel: STUB_ANSWER_MODEL,
    async complete(request) {
      return { text: stubText(request) };
    },
    async *stream(request) {
      const text = stubText(request);
      for (let at = 0; at < text.length; at += STUB_CHUNK_CHARS) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        yield text.slice(at, at + STUB_CHUNK_CHARS);
      }
    },
    async embed(texts) {
      return texts.map((text) => stubEmbedding(text, dimensions));
    },
  };
}
