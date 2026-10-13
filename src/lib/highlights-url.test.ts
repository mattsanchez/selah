import { describe, expect, it } from "vitest";

import { hasFilters, highlightsPath, parseDay, parseHighlightFilters } from "./highlights-url";

describe("parseDay", () => {
  it("reads a day of the calendar and nothing else", () => {
    expect(parseDay("2026-10-13")).toBe("2026-10-13");
    expect(parseDay(" 2024-02-29 ")).toBe("2024-02-29");
    for (const value of ["", undefined, "2026-02-30", "2026-13-01", "10/13/2026", "2026-10-13T00:00", "today"]) {
      expect(parseDay(value)).toBeUndefined();
    }
  });
});

describe("parseHighlightFilters", () => {
  it("reads a color, a book, days and a page", () => {
    const filters = parseHighlightFilters({
      color: "Green",
      book: "1-john",
      from: "2026-10-01",
      to: "2026-10-13",
      page: "3",
    });
    expect(filters).toMatchObject({ color: "green", from: "2026-10-01", to: "2026-10-13", page: 3 });
    expect(filters.book?.name).toBe("1 John");
    expect(parseHighlightFilters({ book: "jn" }).book?.name).toBe("John");
    expect(parseHighlightFilters({ book: "psalms" }).book?.usfm).toBe("PSA");
  });

  it("treats what it does not understand as no filter", () => {
    expect(
      parseHighlightFilters({ color: "red", book: "hezekiah", from: "soon", to: "", page: "0" }),
    ).toEqual({});
    expect(parseHighlightFilters({})).toEqual({});
    expect(parseHighlightFilters({ page: "1" })).toEqual({});
  });

  it("puts days typed the wrong way round in order", () => {
    expect(parseHighlightFilters({ from: "2026-10-13", to: "2026-10-01" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-13",
    });
  });
});

describe("highlightsPath", () => {
  it("writes the filters into the query, and back", () => {
    expect(highlightsPath()).toBe("/highlights");
    expect(highlightsPath({ page: 1 })).toBe("/highlights");
    const filters = parseHighlightFilters({
      color: "yellow",
      book: "song-of-solomon",
      from: "2026-10-01",
      to: "2026-10-13",
      page: "2",
    });
    const path = highlightsPath(filters);
    expect(path).toBe(
      "/highlights?color=yellow&book=song-of-solomon&from=2026-10-01&to=2026-10-13&page=2",
    );
    const query = Object.fromEntries(new URLSearchParams(path.split("?")[1]));
    expect(parseHighlightFilters(query)).toEqual(filters);
  });

  it("drops the page when a filter changes it to 1", () => {
    expect(highlightsPath({ color: "blue", page: 1 })).toBe("/highlights?color=blue");
  });
});

describe("hasFilters", () => {
  it("does not count the page", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ page: 4 })).toBe(false);
    expect(hasFilters({ color: "pink" })).toBe(true);
    expect(hasFilters({ to: "2026-10-13" })).toBe(true);
  });
});
