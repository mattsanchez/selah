import { bookDisplayName, findBook } from "./book-names";
import { bookByNumber, type Book } from "./books";
import {
  bookRange,
  parseVerseId,
  toVerseId,
  type VerseRange,
  type VerseRef,
} from "./verse-id";

// The reference parser: turns what a person types ("John 3:16-21", "jn3.16",
// "Ps 23", "John 3:16-18, 22; 4:1-3") into canonical verse-id ranges, and
// turns ranges back into a reference to print or put in a URL.
//
// What it reads:
// - Book names as ./book-names.ts resolves them; case, spaces and periods do
//   not matter, and the name may run straight into the chapter ("jn3").
// - Chapter and verse separated by ":" or "."; ranges with a hyphen or dash.
//   "John 3" is a chapter, "John 3-4" chapters, "John 3:16-4:3" a range
//   across chapters, "John" the whole book.
// - Several references separated by "," or ";". A bare number after a comma
//   is a verse of the chapter just mentioned ("John 3:16, 18"); after a
//   semicolon, or after a whole chapter, it is a chapter ("John 3:16; 4").
// - Books of one chapter: a bare number is a verse ("Jude 5" is Jude 1:5),
//   except that "Jude 1" is the chapter.
// - Hyphens next to letters count as spaces, so the URL form referenceSlug()
//   writes ("1-john-4.7-12") parses like any other reference.
//
// A reference must exist in the canonical versification (./books.ts), or the
// result is an error saying what is wrong. Whether a translation has the
// verse is a separate question; see ./versification.ts.

export type ReferenceErrorCode =
  | "empty"
  | "syntax"
  | "missing-book"
  | "unknown-book"
  | "ambiguous-book"
  | "no-such-chapter"
  | "no-such-verse"
  | "backwards-range";

export type ReferenceError = {
  code: ReferenceErrorCode;
  // A sentence fit to show the person who typed the reference.
  message: string;
};

export type ParsedReference =
  // One range per reference, in the order written; not merged or sorted.
  | { ok: true; ranges: VerseRange[] }
  | { ok: false; error: ReferenceError };

class Failure extends Error {
  constructor(
    readonly code: ReferenceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Any leading digit, so that "4 John" is reported as an unknown book.
const BOOK = /^(?:\d(?:st|nd|rd|th)?\s*)?[a-z][a-z\s.]*/;
const NUMBERS =
  /^(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?(?:\s*-\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?)?$/;

function normalize(input: string): string {
  return (
    input
      .normalize("NFKC")
      .toLowerCase()
      // Hyphen variants, dashes and the minus sign.
      .replace(/[‐-―−]/g, "-")
      .replace(/(?<=[a-z])\s*-|-\s*(?=[a-z])/g, " ")
      .trim()
  );
}

const list = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
    : names.join("");

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

function resolveBook(name: string): Book {
  const match = findBook(name);
  if (match.book) return match.book;
  const written = name.trim().replace(/\s+/g, " ");
  if (match.candidates.length === 0) {
    throw new Failure("unknown-book", `No book of the Bible is called “${written}”.`);
  }
  throw new Failure(
    "ambiguous-book",
    `“${written}” could be ${list(match.candidates.map((book) => book.name))}.`,
  );
}

function verseId(book: Book, chapter: number, verse: number): number {
  const last = book.verseCounts[chapter - 1];
  if (last === undefined) {
    throw new Failure(
      "no-such-chapter",
      `${book.name} has ${plural(book.verseCounts.length, "chapter")}; there is no chapter ${chapter}.`,
    );
  }
  if (verse < 1 || verse > last) {
    throw new Failure(
      "no-such-verse",
      `${bookDisplayName(book, true)} ${chapter} has ${plural(last, "verse")}; there is no verse ${verse}.`,
    );
  }
  return toVerseId({ book: book.number, chapter, verse });
}

const firstOf = (book: Book, chapter: number) => verseId(book, chapter, 1);
const lastOf = (book: Book, chapter: number) =>
  verseId(book, chapter, book.verseCounts[chapter - 1] ?? 1);

export function parseReference(input: string): ParsedReference {
  try {
    return { ok: true, ranges: parse(input) };
  } catch (error) {
    if (error instanceof Failure) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

function parse(input: string): VerseRange[] {
  const ranges: VerseRange[] = [];
  let book: Book | undefined;
  // The chapter a bare number after a comma is a verse of; undefined after a
  // whole chapter or book.
  let verseChapter: number | undefined;

  // Segments alternate with the separators that follow them.
  const pieces = normalize(input).split(/([,;])/);
  for (let i = 0; i < pieces.length; i += 2) {
    const segment = pieces[i].trim();
    const afterComma = pieces[i - 1] === ",";
    if (!segment) continue;

    const name = BOOK.exec(segment)?.[0];
    if (name) {
      book = resolveBook(name);
      verseChapter = undefined;
    }
    if (!book) {
      throw new Failure("missing-book", "Start with a book, as in “John 3:16”.");
    }

    const rest = segment.slice(name?.length ?? 0).trim();
    if (!rest) {
      ranges.push(bookRange(book.number));
      continue;
    }

    const numbers = NUMBERS.exec(rest);
    if (!numbers) {
      throw new Failure(
        "syntax",
        `Could not read “${rest}” as a chapter and verse. Try “John 3:16-21”.`,
      );
    }
    const [a, b, c, d] = numbers
      .slice(1)
      .map((digits) => (digits === undefined ? undefined : Number(digits)));

    const oneChapter = book.verseCounts.length === 1;
    // Where a number without a chapter is a verse, the chapter it belongs to.
    const bare =
      !name && afterComma && verseChapter !== undefined
        ? verseChapter
        : oneChapter
          ? 1
          : undefined;

    let range: VerseRange;
    if (b !== undefined) {
      // 3:16, 3:16-21, 3:16-4:3
      const endChapter = d === undefined ? a! : c!;
      range = {
        start: verseId(book, a!, b),
        end: verseId(book, endChapter, d ?? c ?? b),
      };
      verseChapter = endChapter;
    } else if (d !== undefined) {
      // 3-4:10, or after "3:16," 18-4:2
      range = {
        start: bare === undefined ? firstOf(book, a!) : verseId(book, bare, a!),
        end: verseId(book, c!, d),
      };
      verseChapter = c;
    } else if (bare !== undefined && !(oneChapter && name && a === 1 && c === undefined)) {
      // 18 or 18-20, as verses
      range = { start: verseId(book, bare, a!), end: verseId(book, bare, c ?? a!) };
      verseChapter = bare;
    } else {
      // 3 or 3-4, as chapters
      range = { start: firstOf(book, a!), end: lastOf(book, c ?? a!) };
      verseChapter = undefined;
    }

    if (range.end < range.start) {
      throw new Failure(
        "backwards-range",
        `“${rest}” ends before it starts. Write the earlier verse first.`,
      );
    }
    ranges.push(range);
  }

  if (ranges.length === 0) {
    throw new Failure("empty", "Type a reference, such as “John 3:16-21” or “Ps 23”.");
  }
  return ranges;
}

// A range that runs past the end of a book, as one range per book.
function splitByBook({ start, end }: VerseRange): VerseRange[] {
  const first = mustParse(start);
  const last = mustParse(end);
  if (end < start) throw new RangeError(`Range ends before it starts: ${start}-${end}`);

  const parts: VerseRange[] = [];
  for (let book = first.book; book <= last.book; book++) {
    const whole = bookRange(book);
    parts.push({
      start: book === first.book ? start : whole.start,
      end: book === last.book ? end : whole.end,
    });
  }
  return parts;
}

function mustParse(id: number): VerseRef {
  const ref = parseVerseId(id);
  if (!ref) throw new RangeError(`Not a verse id: ${id}`);
  return ref;
}

type Part = {
  text: string;
  // Chapters the part touches.
  chapters: [number, number];
  level: "book" | "chapter" | "verse";
};

function describe(book: Book, range: VerseRange): Part {
  const from = mustParse(range.start);
  const to = mustParse(range.end);
  const chapters: [number, number] = [from.chapter, to.chapter];
  const whole = from.verse === 1 && to.verse === book.verseCounts[to.chapter - 1];

  if (whole && from.chapter === 1 && to.chapter === book.verseCounts.length) {
    return { text: "", chapters, level: "book" };
  }
  if (whole) {
    const text =
      from.chapter === to.chapter ? `${from.chapter}` : `${from.chapter}-${to.chapter}`;
    return { text, chapters, level: "chapter" };
  }
  const start = `${from.chapter}:${from.verse}`;
  if (range.start === range.end) return { text: start, chapters, level: "verse" };
  const end = from.chapter === to.chapter ? `${to.verse}` : `${to.chapter}:${to.verse}`;
  return { text: `${start}-${end}`, chapters, level: "verse" };
}

// "John 3:16-18, 22; 4:1-3". The inverse of parseReference: parsing the
// result gives the same ranges back, except that a range crossing from one
// book into the next comes back as one range per book.
export function formatReference(ranges: readonly VerseRange[]): string {
  const groups: { book: Book; parts: Part[] }[] = [];
  for (const range of ranges.flatMap(splitByBook)) {
    const book = bookByNumber(mustParse(range.start).book)!;
    const part = describe(book, range);
    const group = groups.at(-1);
    // A whole book stands alone: "John; John 3:16", never "John; 3:16".
    const joins =
      group?.book === book && part.level !== "book" && group.parts[0].level !== "book";
    if (joins) group.parts.push(part);
    else groups.push({ book, parts: [part] });
  }

  return groups
    .map(({ book, parts }) => {
      const touched = new Set(parts.flatMap((part) => part.chapters));
      const single = touched.size === 1 && parts[0].level !== "book";
      let text = bookDisplayName(book, single);
      parts.forEach((part, i) => {
        const previous = parts[i - 1];
        const [chapter, endChapter] = part.chapters;
        if (!previous) {
          text += part.text && ` ${part.text}`;
        } else if (
          previous.level === "verse" &&
          part.level === "verse" &&
          chapter === endChapter &&
          chapter === previous.chapters[1]
        ) {
          // Same chapter as the verses before: only the verse numbers.
          text += `, ${part.text.slice(part.text.indexOf(":") + 1)}`;
        } else {
          text += `; ${part.text}`;
        }
      });
      return text;
    })
    .join("; ");
}

// The reference as a URL path segment: "john-3.16-18,22;4.1-3". Lowercase,
// hyphens for spaces and "." for ":"; parseReference reads it back.
export function referenceSlug(ranges: readonly VerseRange[]): string {
  return formatReference(ranges)
    .toLowerCase()
    .replace(/:/g, ".")
    .replace(/([,;]) /g, "$1")
    .replace(/ /g, "-");
}

// "John 3", "Psalm 23": the label of one chapter.
export function chapterLabel(bookNumber: number, chapter: number): string {
  const book = bookByNumber(bookNumber);
  if (!book) throw new RangeError(`No such book: ${bookNumber}`);
  return `${bookDisplayName(book, true)} ${chapter}`;
}
