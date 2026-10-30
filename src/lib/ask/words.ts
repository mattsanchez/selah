import { STOP_WORDS } from "@/lib/ai/stub";

// The words of a text that say what it is about, lowercase, each once.
export function contentWords(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  return [...new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

// A question or a passage as a keyword search: any of its words, at most
// `limit` of them. Undefined when it has none worth searching for.
export function anyOf(text: string, limit = 12): string | undefined {
  const words = contentWords(text).slice(0, limit);
  return words.length > 0 ? words.join(" or ") : undefined;
}
