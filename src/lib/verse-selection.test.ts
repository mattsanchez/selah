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

describe("studyVerse and isSelected", () => {
  it("study the first verse selected", () => {
    expect(studyVerse([])).toBeUndefined();
    expect(studyVerse([{ start: 43003017, end: 43003018 }, verse(43003020)])).toBe(43003017);
    expect(isSelected(43003018, [{ start: 43003017, end: 43003018 }])).toBe(true);
    expect(isSelected(43003019, [{ start: 43003017, end: 43003018 }])).toBe(false);
  });
});
