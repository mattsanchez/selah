import { describe, expect, it } from "vitest";

import { bookByUsfm } from "@/lib/bible/books";
import { formatReference } from "@/lib/bible/reference";

import {
  bookSlug,
  interpretQuery,
  parsePage,
  parseScope,
  parseSearchMode,
  readerTranslations,
  scopeName,
  scopeParam,
  scopeRanges,
  searchModeParam,
  searchPath,
  searchTranslationParam,
  selectSearchTranslations,
  verseRange,
} from "./search-url";

const john = bookByUsfm("JHN")!;
const firstJohn = bookByUsfm("1JN")!;
const available = ["bsb", "kjv", "web"];

describe("interpretQuery", () => {
  const reference = (q: string) => {
    const intent = interpretQuery(q);
    return intent.kind === "reference" ? formatReference(intent.ranges) : intent.kind;
  };

  it("sends anything with a chapter or verse that parses to the reader", () => {
    expect(reference("John 3:16-21")).toBe("John 3:16-21");
    expect(reference("jn3.16")).toBe("John 3:16");
    expect(reference(" Ps 23 ")).toBe("Psalm 23");
    expect(reference("john-4.10")).toBe("John 4:10");
    expect(reference("John 3:16-18, 22; 4:1-3")).toBe("John 3:16-18, 22; 4:1-3");
    expect(reference("1 John 4")).toBe("1 John 4");
    expect(reference("is 53")).toBe("Isaiah 53");
  });

  it("sends a book's full name to the reader", () => {
    expect(reference("John")).toBe("John");
    expect(reference("psalms")).toBe("Psalms");
    expect(reference("Psalm")).toBe("Psalms");
    expect(reference("song of solomon")).toBe("Song of Solomon");
    expect(reference("John; Romans")).toBe("John; Romans");
  });

  it("searches for words that are only an abbreviation or prefix of a book, and offers the book", () => {
    for (const [q, book] of [
      ["is", "Isaiah"],
      ["am", "Amos"],
      ["judge", "Judges"],
      ["song", "Song of Solomon"],
      ["lament", "Lamentations"],
      ["roman", "Romans"],
    ]) {
      const intent = interpretQuery(q);
      expect(intent, q).toMatchObject({ kind: "keyword" });
      expect(intent.kind === "keyword" && intent.book && formatReference(intent.book), q).toBe(book);
    }
  });

  it("searches for everything else", () => {
    for (const q of [
      "living water",
      "“good shepherd”",
      '"john"',
      "john the baptist",
      "love one another",
      "3 days",
      "40 years",
      "Acts 2 church",
      "grace -law",
      "'; drop table verse; --",
      "((&|!",
    ]) {
      expect(interpretQuery(q), q).toEqual({ kind: "keyword" });
    }
  });

  it("explains a reference that does not exist instead of searching for it", () => {
    const message = (q: string) => {
      const intent = interpretQuery(q);
      return intent.kind === "bad-reference" ? intent.message : intent.kind;
    };
    expect(message("John 22")).toBe("John has 21 chapters; there is no chapter 22.");
    expect(message("John 3:99")).toBe("John 3 has 36 verses; there is no verse 99.");
    expect(message("John 3:16-2")).toMatch(/ends before it starts/);
    expect(message("Hezekiah 3:16")).toBe("No book of the Bible is called “hezekiah”.");
    expect(message("Hezekiah 3")).toBe("No book of the Bible is called “hezekiah”.");
    expect(message("jo 3")).toMatch(/could be Joshua, Job, Joel, Jonah or John/);
    expect(message("3:16")).toBe("Start with a book, as in “John 3:16”.");
  });

  it("has nothing to do for an empty box", () => {
    expect(interpretQuery("")).toEqual({ kind: "empty" });
    expect(interpretQuery("   ")).toEqual({ kind: "empty" });
  });
});

describe("scope", () => {
  it("names a book by a slug and reads any name the parser knows", () => {
    expect(bookSlug(john)).toBe("john");
    expect(bookSlug(firstJohn)).toBe("1-john");
    expect(bookSlug(bookByUsfm("SNG")!)).toBe("song-of-solomon");
    expect(parseScope("john")).toEqual({ kind: "book", book: john });
    expect(parseScope("1-john")).toEqual({ kind: "book", book: firstJohn });
    expect(parseScope("Jn")).toEqual({ kind: "book", book: john });
    expect(parseScope("song-of-solomon")).toMatchObject({ book: { usfm: "SNG" } });
  });

  it("reads the testaments", () => {
    expect(parseScope("ot")).toEqual({ kind: "testament", testament: "ot" });
    expect(parseScope("NT")).toEqual({ kind: "testament", testament: "nt" });
  });

  it("is the whole Bible for anything else", () => {
    for (const value of [undefined, "", "all", "hezekiah", "jo"]) {
      expect(parseScope(value), String(value)).toBeUndefined();
    }
  });

  it("round-trips through the parameter", () => {
    for (const value of ["ot", "nt", "john", "1-john", "psalms", "revelation"]) {
      expect(scopeParam(parseScope(value))).toBe(value);
    }
    expect(scopeParam(undefined)).toBeUndefined();
  });

  it("covers the right verses", () => {
    expect(scopeRanges(undefined)).toBeUndefined();
    expect(scopeRanges(parseScope("john"))).toEqual([{ start: 43001001, end: 43021025 }]);
    expect(scopeRanges(parseScope("ot"))).toEqual([{ start: 1001001, end: 39004006 }]);
    expect(scopeRanges(parseScope("nt"))).toEqual([{ start: 40001001, end: 66022021 }]);
  });

  it("has a name to print", () => {
    expect(scopeName(parseScope("nt")!)).toBe("the New Testament");
    expect(scopeName(parseScope("1-john")!)).toBe("1 John");
  });
});

describe("selectSearchTranslations", () => {
  it("searches the default translation when none is asked for", () => {
    expect(selectSearchTranslations(undefined, available, "bsb")).toEqual(["bsb"]);
    expect(selectSearchTranslations("", available, "web")).toEqual(["web"]);
    expect(selectSearchTranslations("niv", available, "bsb")).toEqual(["bsb"]);
    expect(selectSearchTranslations(undefined, available, "niv")).toEqual(["bsb"]);
    expect(selectSearchTranslations(undefined, [], "bsb")).toEqual([]);
  });

  it("searches every translation for all", () => {
    expect(selectSearchTranslations("all", available, "bsb")).toEqual(available);
    expect(selectSearchTranslations("ALL", available, "bsb")).toEqual(available);
  });

  it("searches the ones named, in the order they are listed in", () => {
    expect(selectSearchTranslations("web,bsb", available, "bsb")).toEqual(["bsb", "web"]);
    expect(selectSearchTranslations("KJV, niv", available, "bsb")).toEqual(["kjv"]);
  });

  it("reads a parameter given once per translation, as a form of checkboxes sends it", () => {
    expect(selectSearchTranslations(["web", "kjv"], available, "bsb")).toEqual(["kjv", "web"]);
  });

  it("has no upper limit", () => {
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(selectSearchTranslations("a,b,c,d,e", many, "a")).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("searchTranslationParam", () => {
  it("needs no parameter for the default translation alone", () => {
    expect(searchTranslationParam(["bsb"], available, "bsb")).toBeUndefined();
    expect(searchTranslationParam([], available, "bsb")).toBeUndefined();
  });

  it("is all for every translation", () => {
    expect(searchTranslationParam(["web", "kjv", "bsb"], available, "bsb")).toBe("all");
    // With one translation loaded, that one is simply the default.
    expect(searchTranslationParam(["bsb"], ["bsb"], "bsb")).toBeUndefined();
  });

  it("lists the others", () => {
    expect(searchTranslationParam(["web"], available, "bsb")).toBe("web");
    expect(searchTranslationParam(["web", "bsb"], available, "bsb")).toBe("bsb,web");
  });

  it("round-trips with selectSearchTranslations", () => {
    for (const selected of [["bsb"], ["kjv"], ["bsb", "web"], available]) {
      const t = searchTranslationParam(selected, available, "bsb");
      expect(selectSearchTranslations(t, available, "bsb")).toEqual(selected);
    }
  });
});

describe("searchPath", () => {
  it("writes only what differs from the defaults", () => {
    expect(searchPath({ q: "" })).toBe("/search");
    expect(searchPath({ q: "living water" })).toBe("/search?q=living+water");
    expect(searchPath({ q: "living water", page: 1 })).toBe("/search?q=living+water");
    expect(
      searchPath({ q: "living water", t: "bsb,web", scope: parseScope("john"), page: 3 }),
    ).toBe("/search?q=living+water&t=bsb,web&in=john&page=3");
    expect(searchPath({ q: "love", t: "all", scope: parseScope("nt") })).toBe(
      "/search?q=love&t=all&in=nt",
    );
  });

  it("escapes what was typed", () => {
    const path = searchPath({ q: "“good shepherd” & more?" });
    expect(new URL(path, "http://x").searchParams.get("q")).toBe("“good shepherd” & more?");
  });
});

describe("parsePage", () => {
  it("is 1 unless the parameter is a page number", () => {
    expect(parsePage("3")).toBe(3);
    for (const value of [undefined, "", "0", "-2", "1.5", "two", "99999999999"]) {
      expect(parsePage(value), String(value)).toBe(1);
    }
  });
});

describe("readerTranslations", () => {
  it("hands the reader the same translations, but not all", () => {
    expect(readerTranslations("kjv,bsb")).toBe("kjv,bsb");
    expect(readerTranslations(["web", "kjv"])).toBe("web,kjv");
    expect(readerTranslations("all")).toBeUndefined();
    expect(readerTranslations(undefined)).toBeUndefined();
    expect(readerTranslations("bsb&x=<script>")).toBeUndefined();
  });
});

describe("verseRange", () => {
  it("is the one verse", () => {
    expect(verseRange(43004010)).toEqual([{ start: 43004010, end: 43004010 }]);
    expect(() => verseRange(43099001)).toThrow(RangeError);
  });
});

describe("search modes", () => {
  it("reads a mode where meaning search is available, Both by default", () => {
    expect(parseSearchMode(undefined, true)).toBe("both");
    expect(parseSearchMode("both", true)).toBe("both");
    expect(parseSearchMode("meaning", true)).toBe("meaning");
    expect(parseSearchMode("keyword", true)).toBe("keyword");
    expect(parseSearchMode("nonsense", true)).toBe("both");
  });

  it("is always keyword where it is not", () => {
    for (const param of [undefined, "both", "meaning", "keyword"]) {
      expect(parseSearchMode(param, false)).toBe("keyword");
    }
  });

  it("puts in the URL only what is not the default", () => {
    expect(searchModeParam("both", true)).toBeUndefined();
    expect(searchModeParam("meaning", true)).toBe("meaning");
    expect(searchModeParam("keyword", false)).toBeUndefined();
    expect(searchPath({ q: "peace", mode: "meaning", page: 2 })).toBe("/search?q=peace&mode=meaning&page=2");
  });
});
