import { describe, expect, it } from "vitest";

import { editItemPath, itemsPath, parseItemFilters } from "./items-url";

describe("the URLs of My items", () => {
  it("writes only what narrows the list", () => {
    expect(itemsPath()).toBe("/items");
    expect(itemsPath({ kind: "note" })).toBe("/items?kind=note");
    expect(itemsPath({ kind: "reflection", tag: "holy-spirit", page: 3 })).toBe(
      "/items?kind=reflection&tag=holy-spirit&page=3",
    );
    expect(itemsPath({ page: 1 })).toBe("/items");
    expect(editItemPath("abc")).toBe("/items/abc/edit");
  });

  it("reads back what it writes, and nothing it does not know", () => {
    expect(parseItemFilters({ kind: "reflection", tag: "holy-spirit", page: "3" })).toEqual({
      kind: "reflection",
      tag: "holy-spirit",
      page: 3,
    });
    expect(parseItemFilters({ kind: "sermon", tag: "Holy Spirit!", page: "0" })).toEqual({
      kind: undefined,
      tag: "holy-spirit",
      page: undefined,
    });
    expect(parseItemFilters({ page: "2; drop table" })).toEqual({
      kind: undefined,
      tag: undefined,
      page: undefined,
    });
  });
});
