import { describe, expect, it } from "vitest";

import { BOOKS } from "@/lib/bible/books";
import { toVerseId } from "@/lib/bible/verse-id";

import { WINDOW_STRIDE, WINDOW_VERSES, buildWindows, textHash } from "./windows";

// Verses of John, chapter by chapter, with made-up words.
const chapter = (number: number, count: number, book = 43) =>
  Array.from({ length: count }, (_, i) => ({
    verseId: toVerseId({ book, chapter: number, verse: i + 1 }),
    text: `verse${i + 1}`,
  }));

const spans = (verses: Parameters<typeof buildWindows>[0], options?: Parameters<typeof buildWindows>[1]) =>
  buildWindows(verses, options).map((window) => `${window.start % 1000}-${window.end % 1000}`);

describe("buildWindows", () => {
  it("slides four verses at a time, two verses on", () => {
    expect(WINDOW_VERSES).toBe(4);
    expect(WINDOW_STRIDE).toBe(2);
    expect(spans(chapter(1, 10))).toEqual(["1-4", "3-6", "5-8", "7-10"]);
  });

  it("cuts the last window short at the chapter's end, and adds none inside the one before", () => {
    expect(spans(chapter(1, 11))).toEqual(["1-4", "3-6", "5-8", "7-10", "9-11"]);
    expect(spans(chapter(1, 4))).toEqual(["1-4"]);
  });

  it("makes a short chapter one window", () => {
    expect(spans(chapter(1, 2))).toEqual(["1-2"]);
    expect(spans(chapter(1, 1))).toEqual(["1-1"]);
  });

  it("never crosses a chapter or a book", () => {
    const verses = [...chapter(20, 5), ...chapter(21, 5), ...chapter(1, 5, 44)];
    for (const window of buildWindows(verses)) {
      expect(Math.floor(window.start / 1000)).toBe(Math.floor(window.end / 1000));
    }
    expect(buildWindows(verses)).toHaveLength(6);
  });

  it("reads across a verse the translation leaves out", () => {
    const verses = chapter(5, 6).filter((verse) => verse.verseId % 1000 !== 4);
    const [first] = buildWindows(verses);
    expect(first).toMatchObject({ start: 43005001, end: 43005005 });
    expect(first.text).toBe("verse1 verse2 verse3 verse5");
  });

  it("treats line breaks as spaces", () => {
    const [window] = buildWindows([
      { verseId: 19023001, text: "The LORD is my shepherd;\nI shall not want." },
      { verseId: 19023002, text: "  He makes me lie down\n\nin green pastures. " },
    ]);
    expect(window.text).toBe("The LORD is my shepherd; I shall not want. He makes me lie down in green pastures.");
  });

  it("covers every verse, each in at most two windows", () => {
    const counts = new Map<number, number>();
    const verses = chapter(3, 36);
    for (const window of buildWindows(verses)) {
      for (const { verseId } of verses) {
        if (verseId >= window.start && verseId <= window.end) counts.set(verseId, (counts.get(verseId) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(36);
    expect(Math.max(...counts.values())).toBe(2);
  });

  it("has nothing to make of nothing", () => {
    expect(buildWindows([])).toEqual([]);
  });

  it("makes the number of windows the README states for a canonical Bible", () => {
    const windows = BOOKS.flatMap((book, b) =>
      book.verseCounts.flatMap((count, c) =>
        buildWindows(
          Array.from({ length: count }, (_, v) => ({
            verseId: (b + 1) * 1_000_000 + (c + 1) * 1000 + v + 1,
            text: "x",
          })),
        ),
      ),
    );
    expect(windows.length).toBeGreaterThan(14_500);
    expect(windows.length).toBeLessThan(14_800);
  });
});

describe("textHash", () => {
  it("changes with the text, and only with it", () => {
    expect(textHash("In the beginning")).toBe(textHash("In the beginning"));
    expect(textHash("In the beginning")).not.toBe(textHash("In the beginning."));
    expect(textHash("x")).toHaveLength(16);
  });
});
