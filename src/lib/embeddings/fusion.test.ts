import { describe, expect, it } from "vitest";

import { RRF_K, dropOverlaps, fusePassages, fuseRankings, rrfScore } from "./fusion";

const window = (start: number, end: number, translationId = "bsb") => ({ translationId, start, end });
const verse = (verseId: number, translationId = "bsb") => ({ translationId, verseId });

describe("rrfScore", () => {
  it("is 1 / (k + rank), counting ranks from one", () => {
    expect(rrfScore(0)).toBe(1 / (RRF_K + 1));
    expect(rrfScore(9, 10)).toBe(1 / 20);
  });
});

describe("fuseRankings", () => {
  it("puts what both lists have above what only one has, however high", () => {
    expect(fuseRankings([["a", "b", "c"], ["z", "b"]])[0]).toBe("b");
  });

  it("keeps everything from either list, once", () => {
    expect(new Set(fuseRankings([["a", "b"], ["b", "c"]]))).toEqual(new Set(["a", "b", "c"]));
    expect(fuseRankings([["a", "b"], []])).toEqual(["a", "b"]);
    expect(fuseRankings([[], []])).toEqual([]);
  });
});

describe("dropOverlaps", () => {
  it("keeps the better of two windows that share verses", () => {
    expect(dropOverlaps([window(5, 8), window(3, 6), window(9, 12)])).toEqual([window(5, 8), window(9, 12)]);
  });

  it("does not compare across translations", () => {
    const both = [window(1, 4, "bsb"), window(1, 4, "web")];
    expect(dropOverlaps(both)).toEqual(both);
  });
});

describe("fusePassages", () => {
  it("is the windows, best first, with no keyword hits", () => {
    const fused = fusePassages([], [window(40, 43), window(10, 13)]);
    expect(fused.map((passage) => passage.start)).toEqual([40, 10]);
    expect(fused.every((passage) => passage.vector && !passage.keyword)).toBe(true);
  });

  it("is the verses, in their order, with no windows", () => {
    const fused = fusePassages([verse(70), verse(20)], []);
    expect(fused.map((passage) => [passage.start, passage.end])).toEqual([
      [70, 70],
      [20, 20],
    ]);
  });

  it("folds a verse into the window it is in, which then ranks above both lists' others", () => {
    const fused = fusePassages([verse(99), verse(12)], [window(40, 43), window(10, 13)]);
    expect(fused[0]).toMatchObject({ start: 10, end: 13, keyword: true, vector: true });
    expect(fused).toHaveLength(3);
  });

  it("counts a window once, however many of its verses matched", () => {
    const one = fusePassages([verse(11)], [window(10, 13)])[0].score;
    const three = fusePassages([verse(11), verse(12), verse(13)], [window(10, 13)]);
    expect(three).toHaveLength(1);
    expect(three[0].score).toBe(one);
  });

  it("keeps translations apart", () => {
    const fused = fusePassages([verse(11, "web")], [window(10, 13, "bsb")]);
    expect(fused).toHaveLength(2);
    expect(fused.every((passage) => passage.keyword !== passage.vector)).toBe(true);
  });

  it("drops a window overlapping a better one before ranking the rest", () => {
    const fused = fusePassages([], [window(1, 4), window(3, 6), window(5, 8)]);
    expect(fused.map((passage) => passage.start)).toEqual([1, 5]);
    expect(fused[1].score).toBe(rrfScore(1));
  });

  it("settles ties in reading order", () => {
    const fused = fusePassages([verse(50)], [window(90, 93)]);
    expect(fused.map((passage) => passage.start)).toEqual([50, 90]);
  });
});
