import { describe, expect, it } from "vitest";

import { editItemPath, itemLinkPath, itemsPath, parseItemFilters, writePath } from "./items-url";

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

describe("the URLs of the editor", () => {
  it("starts a reflection, or a note, on verses or on none, and says where to go back", () => {
    expect(writePath()).toBe("/write");
    expect(writePath({ kind: "note" })).toBe("/write?kind=note");
    expect(writePath({ kind: "note", v: "john-3.16-18,20", tr: "kjv", back: "/read/john-3?v=john-3.16-18,20" })).toBe(
      "/write?kind=note&v=john-3.16-18,20&tr=kjv&back=/read/john-3%3Fv%3Djohn-3.16-18,20",
    );
    // Verses are a note's; a reflection takes its passages from the document.
    expect(writePath({ v: "john-3.16" })).toBe("/write");
    expect(writePath({ kind: "note", back: "/items" })).toBe("/write?kind=note&back=/items");
  });

  it("reads back what it writes", () => {
    const query = new URL(writePath({ kind: "note", v: "ps-23;24", back: "/read/ps-23?v=ps-23&t=kjv" }), "http://x")
      .searchParams;
    expect(Object.fromEntries(query)).toEqual({ kind: "note", v: "ps-23;24", back: "/read/ps-23?v=ps-23&t=kjv" });
  });

  it("links to an item by one address, whatever it is", () => {
    expect(itemLinkPath("abc")).toBe("/items/abc");
  });
});
