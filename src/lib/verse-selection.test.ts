import { describe, expect, it } from "vitest";

import { isSelected, nextSelection, parseSelection, studyVerse } from "./verse-selection";

const passage = [{ start: 43003016, end: 43003021 }];
const verse = (id: number) => ({ start: id, end: id });

describe("parseSelection", () => {
  it("reads the verses of the passage a `v` parameter names", () => {
    expect(parseSelection("john-3.16", passage)).toEqual([verse(43003016)]);
    expect(parseSelection("John 3:17-18", passage)).toEqual([{ start: 43003017, end: 43003018 }]);
    expect(parseSelection("john-3.16,20", passage)).toEqual([verse(43003016), verse(43003020)]);
  });

  it("selects nothing outside the passage, or from nonsense", () => {
    expect(parseSelection("john-4.1", passage)).toEqual([]);
    expect(parseSelection("john-3.15-17", passage)).toEqual([]);
    expect(parseSelection("john-3.16;4.1", passage)).toEqual([verse(43003016)]);
    expect(parseSelection("nonsense", passage)).toEqual([]);
    expect(parseSelection("", passage)).toEqual([]);
    expect(parseSelection(undefined, passage)).toEqual([]);
  });
});

describe("nextSelection", () => {
  it("selects the clicked verse alone", () => {
    expect(nextSelection([], 43003016)).toEqual([verse(43003016)]);
    expect(nextSelection([verse(43003016)], 43003017)).toEqual([verse(43003017)]);
    expect(nextSelection([{ start: 43003016, end: 43003018 }], 43003016)).toEqual([
      verse(43003016),
    ]);
  });

  it("clears the selection when its only verse is clicked again", () => {
    expect(nextSelection([verse(43003016)], 43003016)).toEqual([]);
  });
});

describe("parseSelection with several verses", () => {
  it("is normalized: reading order, fewest ranges", () => {
    expect(parseSelection("john-3.20,16-18", passage)).toEqual([
      { start: 43003016, end: 43003018 },
      verse(43003020),
    ]);
    expect(parseSelection("john-3.16,17,18", passage)).toEqual([
      { start: 43003016, end: 43003018 },
    ]);
  });

  it("selects only the verses on show when a range spans a gap in the passage", () => {
    const split = [
      { start: 43003016, end: 43003018 },
      { start: 43004001, end: 43004003 },
    ];
    expect(parseSelection("john-3.17-4.2", split)).toEqual([
      { start: 43003017, end: 43003018 },
      { start: 43004001, end: 43004002 },
    ]);
  });
});

describe("nextSelection, adding and removing a verse", () => {
  it("adds a verse apart from the selection as a range of its own", () => {
    expect(nextSelection([verse(43003016)], 43003018, "toggle")).toEqual([
      verse(43003016),
      verse(43003018),
    ]);
    expect(nextSelection([verse(43003018)], 43003016, "toggle")).toEqual([
      verse(43003016),
      verse(43003018),
    ]);
  });

  it("joins a verse next to the selection onto it", () => {
    expect(nextSelection([verse(43003016)], 43003017, "toggle")).toEqual([
      { start: 43003016, end: 43003017 },
    ]);
    expect(nextSelection([verse(43003016), verse(43003018)], 43003017, "toggle")).toEqual([
      { start: 43003016, end: 43003018 },
    ]);
  });

  it("removes a selected verse, splitting the range it was in", () => {
    expect(nextSelection([{ start: 43003016, end: 43003018 }], 43003017, "toggle")).toEqual([
      verse(43003016),
      verse(43003018),
    ]);
    expect(nextSelection([{ start: 43003016, end: 43003018 }], 43003018, "toggle")).toEqual([
      { start: 43003016, end: 43003017 },
    ]);
    expect(nextSelection([verse(43003016)], 43003016, "toggle")).toEqual([]);
  });

  it("starts a selection when there is none", () => {
    expect(nextSelection([], 43003016, "toggle")).toEqual([verse(43003016)]);
    expect(nextSelection([], 43003016, "extend")).toEqual([verse(43003016)]);
  });
});

describe("nextSelection, extending to a verse", () => {
  it("selects through to a verse after the selection", () => {
    expect(nextSelection([verse(43003016)], 43003018, "extend")).toEqual([
      { start: 43003016, end: 43003018 },
    ]);
    expect(nextSelection([{ start: 43003016, end: 43003017 }], 43003020, "extend")).toEqual([
      { start: 43003016, end: 43003020 },
    ]);
  });

  it("selects back to a verse before the selection", () => {
    expect(nextSelection([verse(43003018)], 43003016, "extend")).toEqual([
      { start: 43003016, end: 43003018 },
    ]);
  });

  it("extends the verses before the clicked one, leaving later ones apart", () => {
    expect(
      nextSelection([verse(43003016), verse(43003021)], 43003018, "extend"),
    ).toEqual([{ start: 43003016, end: 43003018 }, verse(43003021)]);
    // And joins up with them when it reaches them.
    expect(
      nextSelection([verse(43003016), verse(43003020)], 43003019, "extend"),
    ).toEqual([{ start: 43003016, end: 43003020 }]);
  });

  it("changes nothing when the verse is already selected", () => {
    const selection = [{ start: 43003016, end: 43003018 }];
    expect(nextSelection(selection, 43003017, "extend")).toEqual(selection);
  });

  it("stays within the passage when it has a gap", () => {
    const split = [
      { start: 43003016, end: 43003018 },
      { start: 43004001, end: 43004003 },
    ];
    expect(nextSelection([verse(43003017)], 43004002, "extend", split)).toEqual([
      { start: 43003017, end: 43003018 },
      { start: 43004001, end: 43004002 },
    ]);
  });

  it("crosses a chapter boundary as one run of verses", () => {
    expect(nextSelection([verse(43003035)], 43004001, "extend")).toEqual([
      { start: 43003035, end: 43004001 },
    ]);
  });
});

describe("studyVerse and isSelected", () => {
  it("study the first verse selected", () => {
    expect(studyVerse([])).toBeUndefined();
    expect(studyVerse([{ start: 43003017, end: 43003018 }, verse(43003020)])).toBe(43003017);
    expect(isSelected(43003018, [{ start: 43003017, end: 43003018 }])).toBe(true);
    expect(isSelected(43003019, [{ start: 43003017, end: 43003018 }])).toBe(false);
  });
});
