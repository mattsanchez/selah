import { BOOKS, type Book } from "@/lib/bible/books";
import { chapterRange, isValidRef, toVerseId, type VerseRange } from "@/lib/bible/verse-id";

// References as the study sources write them, mapped to canonical verse ids.
//
// OpenBible.info and the SWORD modules use OSIS ("John.3.16",
// "Ps.23.1-Ps.23.6"); Tyndale uses its own book codes and a shorter range
// ("IISam.7.1-17", "Gen.1.1-2.3"). All of them number verses as English
// Bibles do, which is the canonical numbering, so a reference maps to itself
// or, when it names a verse the canon does not have, to nothing.

// OSIS book codes in canonical order.
const OSIS = (
  "Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job " +
  "Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag " +
  "Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim " +
  "2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev"
).split(" ");

// Where Tyndale's code for a book is not the OSIS one.
const TYNDALE_ALIASES: Record<string, string> = {
  Pr: "Prov",
  Jon: "Jonah",
  Hagg: "Hag",
  "1Thes": "1Thess",
  "2Thes": "2Thess",
  "1Jn": "1John",
  "2Jn": "2John",
  "3Jn": "3John",
};

const byOsis = new Map(OSIS.map((code, i) => [code, BOOKS[i]]));

export function bookByOsis(code: string): Book | undefined {
  return byOsis.get(code);
}

// Tyndale writes a numbered book either way: "2Sam" and "IISam".
export function bookByTyndale(code: string): Book | undefined {
  const arabic = code.replace(/^(I{1,3})(?=[A-Z])/, (roman) => String(roman.length));
  return byOsis.get(TYNDALE_ALIASES[arabic] ?? arabic);
}

const number = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

function verseId(book: Book, chapter: number, verse: number): number | undefined {
  const ref = { book: book.number, chapter, verse };
  return isValidRef(ref) ? toVerseId(ref) : undefined;
}

// One end of an OSIS range: "John.3.16", or "John.3" for a whole chapter.
function osisPoint(text: string): VerseRange | undefined {
  const [code, chapter, verse, ...more] = text.split(".");
  const book = bookByOsis(code);
  if (!book || more.length > 0 || chapter === undefined) return undefined;
  if (verse === undefined) {
    const c = number(chapter);
    return c >= 1 && c <= book.verseCounts.length ? chapterRange(book.number, c) : undefined;
  }
  const id = verseId(book, number(chapter), number(verse));
  return id === undefined ? undefined : { start: id, end: id };
}

// "John.3.16", "John.3.16-John.3.18", "Ps.23". Undefined when it does not
// name verses of the canon in order.
export function parseOsisRange(text: string): VerseRange | undefined {
  const [from, to, ...more] = text.trim().split("-");
  if (more.length > 0) return undefined;
  const start = osisPoint(from);
  const end = to === undefined ? start : osisPoint(to);
  if (!start || !end || start.start > end.end) return undefined;
  return { start: start.start, end: end.end };
}

// "John.3.16", "John.3.16-21", "Gen.1.1-2.3". With `clamp`, an end past the
// last verse of its chapter is taken to mean the last verse: Tyndale follows
// the NLT, where a few chapters run a verse longer.
export function parseTyndaleRange(text: string, { clamp = false } = {}): VerseRange | undefined {
  const match = /^(\w+)\.(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$/.exec(text.trim());
  if (!match) return undefined;
  const book = bookByTyndale(match[1]);
  if (!book) return undefined;
  const chapter = Number(match[2]);
  const start = verseId(book, chapter, Number(match[3]));
  if (start === undefined) return undefined;
  if (match[5] === undefined) return { start, end: start };

  const endChapter = match[4] === undefined ? chapter : Number(match[4]);
  const last = book.verseCounts[endChapter - 1];
  if (last === undefined) return undefined;
  const endVerse = clamp ? Math.min(Number(match[5]), last) : Number(match[5]);
  const end = verseId(book, endChapter, endVerse);
  return end !== undefined && end >= start ? { start, end } : undefined;
}
