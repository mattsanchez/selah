import { BOOKS, type Book } from "./books";

// How people write book names: "John", "Jn", "1 Cor", "II Kings", "First
// John", "Psalm". Lookup ignores case, spaces and periods, so "1 Jn." and
// "1jn" are the same key.
//
// A name resolves, in order, as: an abbreviation listed here, a USFM code, or
// an unambiguous prefix of a full name ("Deuter", "1 Thess", "Revel").

// Abbreviations a prefix of the full name would not find, or would find
// ambiguous ("Phil" could be Philippians or Philemon; convention says
// Philippians). Keyed by USFM code. Numbered books are written with their
// digit; the other ways of writing the number are added below.
const ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  GEN: ["gn"],
  EXO: ["ex", "exod"],
  LEV: ["lv"],
  NUM: ["nm", "nb"],
  DEU: ["dt"],
  JOS: ["jsh"],
  JDG: ["judg", "jdgs", "jg"],
  RUT: ["rth", "ru"],
  "1SA": ["1sm", "1s"],
  "2SA": ["2sm", "2s"],
  "1KI": ["1kgs", "1k"],
  "2KI": ["2kgs", "2k"],
  "1CH": ["1chr", "1chron"],
  "2CH": ["2chr", "2chron"],
  EZR: ["ez"],
  NEH: ["ne"],
  EST: ["es"],
  JOB: ["jb"],
  PSA: ["psalm", "ps", "pss", "psm", "pslm"],
  PRO: ["prv", "pr"],
  ECC: ["eccl", "eccles", "ec", "qoh"],
  SNG: ["song", "songs", "songofsongs", "sos", "canticles", "cant"],
  ISA: ["is"],
  JER: ["jr"],
  LAM: ["la"],
  EZK: ["ezek", "eze"],
  DAN: ["dn"],
  HOS: ["ho"],
  JOL: ["jl"],
  AMO: ["am"],
  OBA: ["ob"],
  JON: ["jnh"],
  MIC: ["mc"],
  NAM: ["na"],
  HAB: ["hb"],
  ZEP: ["zp"],
  HAG: ["hg"],
  ZEC: ["zc"],
  MAL: ["ml"],
  MAT: ["mt"],
  MRK: ["mk", "mr"],
  LUK: ["lk"],
  JHN: ["jn", "joh"],
  ACT: ["ac"],
  ROM: ["ro", "rm"],
  "1CO": ["1co"],
  "2CO": ["2co"],
  GAL: ["ga"],
  EPH: ["ephes"],
  PHP: ["phil", "pp"],
  COL: [],
  "1TH": ["1th"],
  "2TH": ["2th"],
  "1TI": ["1tm"],
  "2TI": ["2tm"],
  TIT: ["ti"],
  PHM: ["philem", "phlm", "pm"],
  HEB: [],
  JAS: ["jm", "jam"],
  "1PE": ["1pt", "1p"],
  "2PE": ["2pt", "2p"],
  "1JN": ["1jn", "1jhn", "1j"],
  "2JN": ["2jn", "2jhn", "2j"],
  "3JN": ["3jn", "3jhn", "3j"],
  JUD: ["jd"],
  REV: ["rv", "re", "revelations", "apocalypse", "apoc"],
};

// Other ways to write the number of a numbered book.
const ORDINALS: Readonly<Record<string, readonly string[]>> = {
  "1": ["i", "1st", "first"],
  "2": ["ii", "2nd", "second"],
  "3": ["iii", "3rd", "third"],
};

// The lookup key of a name as typed: lowercase, without spaces or periods.
export function bookKey(name: string): string {
  return name.toLowerCase().replace(/[\s.]+/g, "");
}

const fullNames = BOOKS.map((book) => ({ book, key: bookKey(book.name) }));

const exact = new Map<string, Book>();
const listed = fullNames.map(({ book, key }) => ({
  book,
  names: [key, book.usfm.toLowerCase(), ...(ABBREVIATIONS[book.usfm] ?? [])],
}));
for (const { book, names } of listed) {
  for (const name of names) {
    const taken = exact.get(name);
    if (taken && taken !== book) {
      throw new Error(`Book name "${name}" is listed for ${taken.name} and ${book.name}`);
    }
    exact.set(name, book);
  }
}
// "1john" is also "ijohn", "1stjohn" and "firstjohn". A name listed above
// wins: "isa" is Isaiah, not the "1sa" of 1 Samuel.
for (const { book, names } of listed) {
  for (const name of names) {
    for (const ordinal of ORDINALS[name[0]] ?? []) {
      const variant = ordinal + name.slice(1);
      if (!exact.has(variant)) exact.set(variant, book);
    }
  }
}

// Longest first, so "iii" is tried before "ii" and "i".
const ordinalPrefixes = Object.entries(ORDINALS)
  .flatMap(([digit, ordinals]) => ordinals.map((ordinal) => ({ ordinal, digit })))
  .sort((a, b) => b.ordinal.length - a.ordinal.length);

// "ijohn" -> "1john", so a prefix can be matched against the full names.
function digitForm(key: string): string {
  const match = ordinalPrefixes.find(
    ({ ordinal }) => key.startsWith(ordinal) && key.length > ordinal.length,
  );
  return match ? match.digit + key.slice(match.ordinal.length) : key;
}

export type BookMatch =
  | { book: Book }
  // Empty when nothing matches; two or more when the name is ambiguous.
  | { book?: undefined; candidates: Book[] };

export function findBook(name: string): BookMatch {
  const key = bookKey(name);
  const known = exact.get(key);
  if (known) return { book: known };
  if (key.length < 2) return { candidates: [] };

  const candidates = new Set<Book>();
  for (const prefix of new Set([key, digitForm(key)])) {
    for (const { book, key: full } of fullNames) {
      if (full.startsWith(prefix)) candidates.add(book);
    }
  }
  const [only, ...others] = candidates;
  if (only && others.length === 0) return { book: only };
  return { candidates: [...candidates] };
}

// The name to print before a chapter number: "Psalm 23", but "Psalms 23-24".
export function bookDisplayName(book: Book, singleChapter = false): string {
  return book.usfm === "PSA" && singleChapter ? "Psalm" : book.name;
}
