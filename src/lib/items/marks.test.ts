import { describe, expect, it } from "vitest";

import { highlightsOn, placeHighlights, verseMark, type Highlight } from "./marks";

const verse = (id: number) => ({ start: id, end: id });
const range = (start: number, end: number) => ({ start, end });

let made = 0;
// Each highlight is a minute newer than the one made before it.
function highlight(
  color: string,
  passages: { start: number; end: number }[],
  note: string | null = null,
): Highlight {
  made += 1;
  return {
    id: `h${made}`,
    color,
    note,
    createdAt: new Date(Date.UTC(2026, 9, 13, 12, made)),
    passages,
  };
}

const passage = [range(43003016, 43003021)];
const shown = [43003016, 43003017, 43003018, 43003019, 43003020, 43003021];

describe("verseMark", () => {
  it("is the color of the highlight on the verse", () => {
    const yellow = highlight("yellow", [range(43003016, 43003017)]);
    expect(verseMark([yellow], 43003016)).toEqual({ color: "yellow", count: 1 });
    expect(verseMark([yellow], 43003018)).toBeUndefined();
    expect(verseMark([], 43003016)).toBeUndefined();
  });

  it("shows the newest of overlapping highlights, with the one beneath as a stripe", () => {
    const yellow = highlight("yellow", [range(43003016, 43003018)]);
    const blue = highlight("blue", [range(43003017, 43003019)]);
    const marks = (id: number) => verseMark([yellow, blue], id);
    expect(marks(43003016)).toEqual({ color: "yellow", count: 1 });
    expect(marks(43003017)).toEqual({ color: "blue", under: "yellow", count: 2 });
    expect(marks(43003019)).toEqual({ color: "blue", count: 1 });
    // The order they are given in does not matter.
    expect(verseMark([blue, yellow], 43003018)).toEqual({ color: "blue", under: "yellow", count: 2 });
  });

  it("has no stripe where the overlapping highlights are one color", () => {
    const first = highlight("green", [verse(43003016)]);
    const second = highlight("green", [range(43003016, 43003017)]);
    const third = highlight("pink", [verse(43003016)]);
    expect(verseMark([first, second], 43003016)).toEqual({ color: "green", count: 2 });
    expect(verseMark([first, second, third], 43003016)).toEqual({
      color: "pink",
      under: "green",
      count: 3,
    });
  });

  it("covers every run of a highlight of verses that are apart", () => {
    const apart = highlight("purple", [range(43003016, 43003017), verse(43003020)]);
    expect(verseMark([apart], 43003017)?.color).toBe("purple");
    expect(verseMark([apart], 43003018)).toBeUndefined();
    expect(verseMark([apart], 43003020)?.color).toBe("purple");
  });
});

describe("placeHighlights", () => {
  it("marks the verses on show and leaves the rest alone", () => {
    const yellow = highlight("yellow", [range(43003014, 43003017)]);
    const placed = placeHighlights([yellow], passage, shown);
    expect(placed.mark(43003016)).toEqual({ color: "yellow", count: 1 });
    expect(placed.mark(43003018)).toBeUndefined();
    expect(placed.hidden).toEqual([]);
  });

  it("puts a note after the last verse of its highlight that is on show", () => {
    const noted = highlight("green", [range(43003016, 43003017), verse(43003020)], "The light");
    const bare = highlight("blue", [verse(43003018)]);
    const placed = placeHighlights([noted, bare], passage, shown);
    expect(placed.notes(43003020)).toEqual([
      { id: noted.id, note: "The light", ranges: [range(43003016, 43003017), verse(43003020)] },
    ]);
    expect(placed.notes(43003017)).toEqual([]);
    expect(placed.notes(43003018)).toEqual([]);
  });

  it("keeps a note in reach when the highlight runs past the passage", () => {
    const long = highlight("pink", [range(43003020, 43003030)], "Runs on");
    const placed = placeHighlights([long], passage, shown);
    expect(placed.notes(43003021)).toEqual([
      { id: long.id, note: "Runs on", ranges: [range(43003020, 43003021)] },
    ]);
  });

  it("puts a note on an earlier verse when the translation lacks the last one", () => {
    // John 5:4 is not in the BSB.
    const pool = highlight("yellow", [range(43005003, 43005004)], "The pool");
    const placed = placeHighlights([pool], [range(43005001, 43005009)], [43005003, 43005005]);
    expect(placed.notes(43005003)).toHaveLength(1);
    expect(placed.mark(43005003)?.color).toBe("yellow");
    expect(placed.hidden).toEqual([]);
  });

  it("lists a highlight whose every verse is missing from what is on show", () => {
    const missing = highlight("yellow", [verse(43005004)], "Not in the BSB");
    const other = highlight("blue", [verse(43005005)]);
    const placed = placeHighlights(
      [missing, other],
      [range(43005001, 43005009)],
      [43005003, 43005005],
    );
    expect(placed.hidden).toEqual([missing]);
    expect(placed.notes(43005005)).toEqual([]);
    expect(placed.mark(43005005)).toEqual({ color: "blue", count: 1 });
    // With a translation that has the verse, it shows like any other.
    const withKjv = placeHighlights([missing], [range(43005001, 43005009)], [43005003, 43005004]);
    expect(withKjv.hidden).toEqual([]);
    expect(withKjv.mark(43005004)?.color).toBe("yellow");
  });

  it("ignores highlights that are not on the passage", () => {
    const elsewhere = highlight("yellow", [verse(45008028)], "Romans");
    const placed = placeHighlights([elsewhere], passage, shown);
    expect(placed.hidden).toEqual([]);
    expect(shown.every((id) => placed.mark(id) === undefined)).toBe(true);
  });
});

describe("highlightsOn", () => {
  it("finds the highlights that share a verse with the selection, oldest first", () => {
    const first = highlight("yellow", [range(43003016, 43003018)]);
    const second = highlight("blue", [verse(43003020)]);
    const third = highlight("pink", [range(43003018, 43003019)]);
    const all = [third, first, second];
    expect(highlightsOn(all, [verse(43003018)])).toEqual([first, third]);
    expect(highlightsOn(all, [verse(43003016), verse(43003020)])).toEqual([first, second]);
    expect(highlightsOn(all, [verse(43003021)])).toEqual([]);
  });
});
