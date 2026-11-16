import { describe, expect, it } from "vitest";

import { MATCH_WORDS, RunIndex, matchedRuns, readWords, runKeys } from "./source-words";

const norms = (text: string) => readWords(text).map((word) => word.norm);
const words = (count: number, prefix = "w") => Array.from({ length: count }, (_, i) => `${prefix}${i}`);

// The runs of `post` found in `notes`, as the post's words.
function found(notes: string[], post: string, except: string[] = []) {
  const index = RunIndex.build(notes.map(norms), { except: except.map((text) => runKeys(norms(text))) });
  const postWords = norms(post);
  return [...index.find(postWords)].map(([doc, positions]) => ({
    doc,
    runs: matchedRuns(postWords, norms(notes[doc]), positions).map(([a, b]) => postWords.slice(a, b + 1).join(" ")),
  }));
}

describe("readWords", () => {
  it("ignores case, accents, apostrophes, punctuation and numbers, and keeps where each word is", () => {
    const text = "God’s  LOVE, “naïve”—don't stop: 3:16! 2nd";
    expect(readWords(text)).toEqual([
      { norm: "gods", start: 0, end: 5 },
      { norm: "love", start: 7, end: 11 },
      { norm: "naive", start: 14, end: 19 },
      { norm: "dont", start: 21, end: 26 },
      { norm: "stop", start: 27, end: 31 },
      { norm: "2nd", start: 39, end: 42 },
    ]);
  });

  it("splits at hyphens and dashes, the same way for both texts", () => {
    expect(norms("well-known — and so–on")).toEqual(["well", "known", "and", "so", "on"]);
  });
});

describe("finding a note's words", () => {
  const note = words(40).join(" ");

  it(`needs ${MATCH_WORDS} words in a row`, () => {
    expect(MATCH_WORDS).toBe(12);
    const twelve = words(12).join(" ");
    expect(found([note], `My own words, then ${twelve}, and mine again.`)).toEqual([{ doc: 0, runs: [twelve] }]);
    expect(found([note], `My own words, then ${words(11).join(" ")}, and mine again.`)).toEqual([]);
  });

  it("joins a longer copy into one run, and a changed word breaks it", () => {
    const copy = words(30);
    expect(found([note], copy.join(" "))).toEqual([{ doc: 0, runs: [copy.join(" ")] }]);

    const changed = [...copy];
    changed[15] = "other";
    expect(found([note], changed.join(" "))).toEqual([
      { doc: 0, runs: [copy.slice(0, 15).join(" "), copy.slice(16).join(" ")] },
    ]);
    // One word changed in every 11 leaves no run long enough.
    const sparse = copy.map((word, i) => (i % 11 === 10 ? "other" : word));
    expect(found([note], sparse.join(" "))).toEqual([]);
  });

  it("leaves out runs the notes share with the texts given as `except`", () => {
    const verse = "for God so loved the world that he gave his one and only Son";
    const notes = [`The writer says ${verse} and then goes on in words of the note itself which are long enough`];
    const post = `I read ${verse} this morning.`;
    expect(found(notes, post)).toHaveLength(1);
    expect(found(notes, post, [verse])).toEqual([]);
    const index = RunIndex.build(notes.map(norms), { except: [runKeys(norms(verse))] });
    expect(index.excluded).toBeGreaterThan(0);
  });

  it("checks every key against the words themselves", () => {
    // Positions as a clash of keys would give them: the words differ.
    expect(matchedRuns(words(20, "a"), words(20, "b"), [0, 1, 2])).toEqual([]);
    expect(matchedRuns(words(20), words(20), [0, 1, 8])).toEqual([[0, 19]]);
  });

  it("names each note that has the run", () => {
    const shared = words(14, "s").join(" ");
    expect(found([`first ${shared}`, `second ${shared}`, words(20, "x").join(" ")], shared).map((each) => each.doc)).toEqual([
      0, 1,
    ]);
  });
});
