// Finding the words of a source in a post: long runs of the same words in the
// same order, and nothing else. Pure: the index is built from whatever text
// it is given, and src/lib/items/uncredited.ts gives it the share-alike
// sources' notes.
//
// What counts as the same words is deliberately narrow. Case, accents,
// apostrophes and punctuation are ignored; every other difference (a word
// changed, added or left out) breaks the run. So a run is a copy of the
// source's words, never a paraphrase, and a short or common phrase never
// makes one: it takes MATCH_WORDS words in a row.

// How many consecutive words make a match. 12 words in the same order is a
// sentence, not a turn of phrase; see the sizing notes in DATA-LICENSES.md.
export const MATCH_WORDS = 12;

export type Word = {
  // Lowercase, without accents or apostrophes: "god’s" and "Gods" are "gods".
  norm: string;
  // Where it is in the text it was read from.
  start: number;
  end: number;
};

// A word is letters and digits, with apostrophes inside it ("don’t").
// Anything else, hyphens and dashes included, separates words. Numbers alone
// ("3:16", "4:9-10") are not words: references would otherwise lengthen a
// run, so that a 10-word verse with its "1:1" counted as 12.
const WORD = /[\p{L}\p{N}]+(?:['’‘ʼ][\p{L}\p{N}]+)*/gu;
const LETTER = /\p{L}/u;

const normalize = (word: string) =>
  word.normalize("NFKD").replace(/\p{M}/gu, "").replace(/['’‘ʼ]/g, "").toLowerCase();

export function readWords(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    if (!LETTER.test(match[0])) continue;
    words.push({ norm: normalize(match[0]), start: match.index, end: match.index + match[0].length });
  }
  return words;
}

// Two 32-bit FNV-1a hashes of a word, from different offsets.
function wordHashes(word: string): [number, number] {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < word.length; i++) {
    const c = word.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return [a >>> 0, b >>> 0];
}

// One number (53 bits, exact as a double) for each run of `size` words: the
// i-th is the run that starts at word i. Only a hint: a match is always
// checked against the words themselves (matchedRuns).
export function runKeys(words: readonly string[], size = MATCH_WORDS): Float64Array {
  const count = Math.max(0, words.length - size + 1);
  const keys = new Float64Array(count);
  if (count === 0) return keys;
  const hashes = words.map(wordHashes);
  for (let i = 0; i < count; i++) {
    let hi = 0x9e3779b9;
    let lo = 0x85ebca6b;
    for (let j = 0; j < size; j++) {
      const [a, b] = hashes[i + j];
      hi = Math.imul(hi ^ a, 0x01000193);
      lo = Math.imul(lo ^ b, 0x5bd1e995) ^ (lo >>> 13);
    }
    keys[i] = (hi >>> 0) * 2 ** 21 + ((lo >>> 0) >>> 11);
  }
  return keys;
}

// Every run of `size` words of every document, as a sorted table of keys and
// the documents they occur in: about 12 bytes a word, searched by bisection.
// A run whose key is in `except` (runKeys of other texts) is left out, so
// text the documents share with them (a Bible verse a note quotes) never
// matches.
export class RunIndex {
  private constructor(
    private readonly keys: Float64Array,
    private readonly docs: Uint32Array,
    readonly size: number,
    readonly documents: number,
    // How many runs were left out for occurring in an `except` text.
    readonly excluded: number,
  ) {}

  static build(
    documents: readonly (readonly string[])[],
    { size = MATCH_WORDS, except = [] }: { size?: number; except?: readonly Float64Array[] } = {},
  ): RunIndex {
    const parts = documents.map((words) => runKeys(words, size));
    const total = parts.reduce((n, keys) => n + keys.length, 0);
    const keys = new Float64Array(total);
    const docs = new Uint32Array(total);
    let at = 0;
    parts.forEach((part, doc) => {
      keys.set(part, at);
      docs.fill(doc, at, at + part.length);
      at += part.length;
    });
    const order = new Uint32Array(total);
    for (let i = 0; i < total; i++) order[i] = i;
    order.sort((x, y) => keys[x] - keys[y] || docs[x] - docs[y]);

    const left = sortedKeys(except);
    const sorted = new Float64Array(total);
    const sortedDocs = new Uint32Array(total);
    let kept = 0;
    for (let i = 0; i < total; i++) {
      const key = keys[order[i]];
      if (left.length > 0 && left[lowerBound(left, key)] === key) continue;
      sorted[kept] = key;
      sortedDocs[kept] = docs[order[i]];
      kept++;
    }
    return new RunIndex(sorted.slice(0, kept), sortedDocs.slice(0, kept), size, documents.length, total - kept);
  }

  get runs(): number {
    return this.keys.length;
  }

  get bytes(): number {
    return this.keys.byteLength + this.docs.byteLength;
  }

  // For each document that may share a run with these words, the positions
  // of the runs (their first word) it may share.
  find(words: readonly string[]): Map<number, number[]> {
    const found = new Map<number, number[]>();
    runKeys(words, this.size).forEach((key, position) => {
      for (let i = lowerBound(this.keys, key); i < this.keys.length && this.keys[i] === key; i++) {
        const positions = found.get(this.docs[i]);
        if (!positions) found.set(this.docs[i], [position]);
        else if (positions.at(-1) !== position) positions.push(position);
      }
    });
    return found;
  }
}

function lowerBound(keys: Float64Array, key: number): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sortedKeys(parts: readonly Float64Array[]): Float64Array {
  const all = new Float64Array(parts.reduce((n, keys) => n + keys.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all.sort();
}

// The runs of `words` (as [first, last] word positions, inclusive) that are
// at least `size` words long and appear word for word in `source`. Only the
// runs starting at `positions` (RunIndex.find) are considered, and each is
// checked word by word, so a clash of keys never makes a match.
export function matchedRuns(
  words: readonly string[],
  source: readonly string[],
  positions: readonly number[],
  size = MATCH_WORDS,
): [number, number][] {
  if (words.length < size || source.length < size) return [];
  const sourceRuns = new Set<string>();
  for (let i = 0; i + size <= source.length; i++) sourceRuns.add(source.slice(i, i + size).join(" "));
  const runs: [number, number][] = [];
  for (const i of [...positions].sort((a, b) => a - b)) {
    if (i + size > words.length || !sourceRuns.has(words.slice(i, i + size).join(" "))) continue;
    const last = i + size - 1;
    const open = runs.at(-1);
    if (open && i <= open[1]) open[1] = Math.max(open[1], last);
    else runs.push([i, last]);
  }
  return runs;
}
