import { bookKey, findBook } from "@/lib/bible/book-names";
import { BOOKS, type Book } from "@/lib/bible/books";
import { parseReference } from "@/lib/bible/reference";
import type { SearchMode } from "@/lib/bible/search";
import { bookRange, parseVerseId, type VerseRange } from "@/lib/bible/verse-id";

// The search page's URLs, and how it reads what is typed in the one box the
// reader and the search page share.
//
//   /search                              the box, with examples
//   /search?q=living+water               keyword search, default translation
//   /search?q=living+water&t=all         ... in every local translation
//   /search?q=living+water&t=bsb,kjv     ... in the ones named
//   /search?q=living+water&in=john       ... in one book
//   /search?q=living+water&in=nt         ... in a testament ("ot" or "nt")
//   /search?q=shepherd&page=2            the second page of results
//   /search?q=anxiety&mode=meaning       by meaning alone, or mode=keyword; by
//                                        both when absent, where meaning search
//                                        is available, and by keyword where not
//   /search?q=jn+4.10                    a reference: redirects to the reader
//
// `t` means what it means in the reader (src/lib/reader-url.ts), so the
// translations chosen there carry over to a search and back.

export const SEARCH_PAGE_SIZE = 20;

export type Testament = "ot" | "nt";

// Where to search: a testament or one book. The whole Bible when undefined.
export type SearchScope =
  | { kind: "testament"; testament: Testament }
  | { kind: "book"; book: Book };

const FIRST_NT_BOOK = 40;

export function testamentOf(book: Book): Testament {
  return book.number < FIRST_NT_BOOK ? "ot" : "nt";
}

export const TESTAMENT_NAMES: Readonly<Record<Testament, string>> = {
  ot: "Old Testament",
  nt: "New Testament",
};

// "john", "1-john", "song-of-solomon": a book as the `in` parameter names it.
export function bookSlug(book: Book): string {
  return book.name.toLowerCase().replace(/ /g, "-");
}

// The value of the `in` parameter for a scope, and back. Any name the
// reference parser knows a book by is read ("jn", "1 John").
export function scopeParam(scope: SearchScope | undefined): string | undefined {
  if (!scope) return undefined;
  return scope.kind === "testament" ? scope.testament : bookSlug(scope.book);
}

export function parseScope(param: string | undefined): SearchScope | undefined {
  const value = param?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "ot" || value === "nt") return { kind: "testament", testament: value };
  const { book } = findBook(value.replace(/-/g, " "));
  return book ? { kind: "book", book } : undefined;
}

export function scopeName(scope: SearchScope): string {
  return scope.kind === "testament" ? `the ${TESTAMENT_NAMES[scope.testament]}` : scope.book.name;
}

// The verses a scope covers, as searchVerses() takes them.
export function scopeRanges(scope: SearchScope | undefined): VerseRange[] | undefined {
  if (!scope) return undefined;
  if (scope.kind === "book") return [bookRange(scope.book.number)];
  const [first, last] =
    scope.testament === "ot" ? [1, FIRST_NT_BOOK - 1] : [FIRST_NT_BOOK, BOOKS.length];
  return [{ start: bookRange(first).start, end: bookRange(last).end }];
}

// The translations a `t` parameter asks to search, in the order of
// `available`: every one for "all", otherwise the known ids it names, or the
// default translation when it names none. Unlike the reader's parallel view
// there is no upper limit. A form of checkboxes submits `t` once per box, so
// a list of values reads like one comma-separated value.
export function selectSearchTranslations(
  param: string | readonly string[] | undefined,
  available: readonly string[],
  defaultId: string,
): string[] {
  const asked = [param ?? []]
    .flat()
    .flatMap((value) => value.split(","))
    .map((id) => id.trim().toLowerCase());
  if (asked.includes("all")) return [...available];
  const known = available.filter((id) => asked.includes(id));
  if (known.length > 0) return known;
  return available.includes(defaultId) ? [defaultId] : available.slice(0, 1);
}

// The `t` parameter for a selection: undefined for the default translation
// alone, "all" for every translation when there is more than one.
export function searchTranslationParam(
  selected: readonly string[],
  available: readonly string[],
  defaultId: string,
): string | undefined {
  const known = available.filter((id) => selected.includes(id));
  if (known.length === 0) return undefined;
  if (known.length === 1 && known[0] === defaultId) return undefined;
  if (known.length === available.length && known.length > 1) return "all";
  return known.join(",");
}

// A `page` parameter as a page number; 1 for anything else.
export function parsePage(param: string | undefined): number {
  const page = /^\d{1,6}$/.test(param ?? "") ? Number(param) : 1;
  return Math.max(page, 1);
}

// What a `mode` parameter asks for, on a search where meaning is `available`
// (or not, when every mode is the keyword search).
export function parseSearchMode(param: string | undefined, available: boolean): SearchMode {
  if (!available) return "keyword";
  return param === "keyword" || param === "meaning" ? param : "both";
}

// The `mode` parameter for a mode: none for the default.
export const searchModeParam = (mode: SearchMode, available: boolean): SearchMode | undefined =>
  available && mode !== "both" ? mode : undefined;

export type SearchLocation = {
  q: string;
  // As searchTranslationParam() returns it.
  t?: string;
  scope?: SearchScope;
  page?: number;
  // As searchModeParam() returns it.
  mode?: SearchMode;
};

export function searchPath({ q, t, scope, page = 1, mode }: SearchLocation): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (t) params.set("t", t);
  const within = scopeParam(scope);
  if (within) params.set("in", within);
  if (mode) params.set("mode", mode);
  if (page > 1) params.set("page", String(page));
  // "," reads better left as it is, as in the reader's URLs.
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `/search?${query}` : "/search";
}

// What the box was asked for.
export type QueryIntent =
  | { kind: "empty" }
  // A reference: open it in the reader.
  | { kind: "reference"; ranges: VerseRange[] }
  // Written as a reference, but not one that exists: say why.
  | { kind: "bad-reference"; message: string }
  // Words to search the text for. `book` is set when the words are also a
  // way of writing a book's name ("is", "judge", "mark 5 loaves" is not), so
  // the page can offer the book as well.
  | { kind: "keyword"; book?: VerseRange[] };

// A book name followed by nothing but numbers: "Hezekiah 3", "jo 3:16-18".
const REFERENCE_SHAPED =
  /^(?:\d\s*)?[^\d,;:]*[a-z.]\s*\d{1,3}(?:\s*[-‐-―−:.,;]\s*\d{1,3})*$/i;
// A chapter and verse anywhere: "3:16".
const CHAPTER_AND_VERSE = /\d\s*:\s*\d/;

// The names a book is called in full: "john", "psalms" and "psalm".
const fullNames = new Set([...BOOKS.map((book) => book.name), "Psalm"].map(bookKey));

// Decides between the reader and keyword search. Anything with a chapter or
// verse that parses is a reference. Words alone are a reference only when
// they are a book's full name ("John", "Song of Solomon"): the parser also
// reads abbreviations and prefixes, and "is", "am", "mark" or "judge" typed
// alone are more likely words to search for. A quoted word is never a
// reference, so "john" in quotes searches for the name.
export function interpretQuery(input: string): QueryIntent {
  const q = input.trim();
  if (!q) return { kind: "empty" };

  const parsed = parseReference(q);
  if (parsed.ok) {
    const named =
      /\d/.test(q) ||
      q
        .split(/[,;]/)
        .filter((name) => name.trim())
        .every((name) => fullNames.has(bookKey(name.replace(/-/g, " "))));
    return named
      ? { kind: "reference", ranges: parsed.ranges }
      : { kind: "keyword", book: parsed.ranges };
  }

  const { code, message } = parsed.error;
  const existsNot =
    code === "no-such-chapter" || code === "no-such-verse" || code === "backwards-range";
  if (existsNot || CHAPTER_AND_VERSE.test(q) || REFERENCE_SHAPED.test(q)) {
    return { kind: "bad-reference", message };
  }
  return { kind: "keyword" };
}

// The `t` parameter to hand the reader: the search's own, except "all",
// which the reader's parallel view has no room for.
export function readerTranslations(param: string | readonly string[] | undefined): string | undefined {
  const t = [param ?? []].flat().join(",");
  return /^[a-z0-9_,-]+$/i.test(t) && !/(^|,)all(,|$)/i.test(t) ? t : undefined;
}

// One verse as a range, for readerPath().
export function verseRange(verseId: number): VerseRange[] {
  if (!parseVerseId(verseId)) throw new RangeError(`Not a verse id: ${verseId}`);
  return [{ start: verseId, end: verseId }];
}
