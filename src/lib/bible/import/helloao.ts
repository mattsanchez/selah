import type { Break, Footnote, Heading, Span, VerseRecord } from "../types";
import { canonicalVerseId } from "../versification";

// The `complete.json` format of the Free Use Bible API (bible.helloao.org),
// reduced to the fields the import reads.
type InlineItem =
  | string
  | { text: string; poem?: number; descriptive?: boolean; wordsOfJesus?: boolean }
  | { noteId: number }
  | { lineBreak: true };

type ChapterItem =
  | { type: "heading"; content: string[] }
  | { type: "hebrew_subtitle"; content: InlineItem[] }
  | { type: "line_break" }
  | { type: "verse"; number: number; content: InlineItem[] };

export type HelloaoTranslation = {
  books: {
    id: string;
    chapters: {
      chapter: {
        number: number;
        content: ChapterItem[];
        footnotes: { noteId: number; text: string }[];
      };
    }[];
  }[];
};

export type NormalizeOptions = {
  // Our translation id, which selects the renumbering rules in versification.ts.
  translationId: string;
  // The KJV's notes start with their own reference ("3.3 for: or, about").
  stripFootnoteOrigin?: boolean;
  // The KJV marks a paragraph with a pilcrow at the start of its first verse.
  // The mark is taken out of the text and kept as a paragraph break.
  pilcrowParagraphs?: boolean;
  // USFM codes of the books to keep; every book when omitted.
  books?: readonly string[];
};

const CLOSING = /^[.,;:!?)\]”’—]/;
const OPENING = /[(\[“‘—]$/;

type TextItem = Exclude<InlineItem, string | { noteId: number } | { lineBreak: true }>;

const isNote = (item: InlineItem): item is { noteId: number } =>
  typeof item === "object" && "noteId" in item;
const isLineBreak = (item: InlineItem): item is { lineBreak: true } =>
  typeof item === "object" && "lineBreak" in item;
const asText = (item: string | TextItem): TextItem =>
  typeof item === "string" ? { text: item } : item;

// The poetic indent of a piece of text: 0 for prose, 1 and up for poetry.
const levelOf = (item: TextItem): number => item.poem ?? 0;

// In the source a line break between two lines of poetry at the same indent
// only separates the lines; any other line break opens a paragraph or stanza.
const opensParagraph = (before: number, after: number): boolean =>
  before === 0 || before !== after;

export type FlatInline = {
  text: string;
  footnotes: Footnote[];
  // Paragraph breaks inside the text; never at offset 0.
  breaks: Break[];
  wordsOfJesus: Span[];
  // Indent of the first and last piece of text; undefined when there is none.
  firstLevel?: number;
  lastLevel?: number;
  // Whether a line break comes before the first, or after the last, piece.
  leadingBreak: boolean;
  trailingBreak: boolean;
};

// Flattens a verse's or superscription's content into plain text and the
// notes, paragraph breaks and red-letter spans anchored in it.
//
// Two neighbouring pieces at the same indent are one line (the source splits
// a line wherever a note marker or a change of speaker falls) unless a line
// break separates them; pieces at different indents are different lines.
// Lines are joined with "\n".
export function flattenInline(
  items: readonly InlineItem[],
  notes: ReadonlyMap<number, string>,
): FlatInline {
  let text = "";
  const footnotes: Footnote[] = [];
  const breaks: Break[] = [];
  const wordsOfJesus: Span[] = [];
  let first: TextItem | undefined;
  let previous: TextItem | undefined;
  let leadingBreak = false;
  let breakPending = false;

  for (const item of items) {
    if (isNote(item)) {
      const note = notes.get(item.noteId);
      if (note === undefined) throw new Error(`Missing footnote ${item.noteId}`);
      footnotes.push({ offset: text.length, text: note });
      continue;
    }
    if (isLineBreak(item)) {
      if (previous) breakPending = true;
      else leadingBreak = true;
      continue;
    }

    const current = asText(item);
    const piece = current.text.replace(/\s+/g, " ").trim();
    if (piece === "") continue;

    if (previous) {
      const [before, after] = [levelOf(previous), levelOf(current)];
      if (breakPending || before !== after) {
        text += "\n";
        if (breakPending && opensParagraph(before, after)) {
          breaks.push({ offset: text.length, kind: "paragraph" });
        }
      } else if (!CLOSING.test(piece) && !OPENING.test(text)) {
        text += " ";
      }
    }

    if (current.wordsOfJesus) {
      const open = previous?.wordsOfJesus ? wordsOfJesus.at(-1) : undefined;
      if (open) open.end = text.length + piece.length;
      else wordsOfJesus.push({ start: text.length, end: text.length + piece.length });
    }
    text += piece;
    first ??= current;
    previous = current;
    breakPending = false;
  }

  return {
    text,
    footnotes,
    breaks,
    wordsOfJesus,
    firstLevel: first && levelOf(first),
    lastLevel: previous && levelOf(previous),
    leadingBreak,
    trailingBreak: breakPending,
  };
}

// Removes `length` characters from the start of a flattened text.
function dropPrefix(flat: FlatInline, length: number): void {
  const shift = (offset: number) => Math.max(0, offset - length);
  flat.text = flat.text.slice(length);
  for (const note of flat.footnotes) note.offset = shift(note.offset);
  for (const item of flat.breaks) item.offset = shift(item.offset);
  for (const span of flat.wordsOfJesus) {
    span.start = shift(span.start);
    span.end = shift(span.end);
  }
}

// Converts a helloao translation into verse records with canonical ids.
// Headings attach to the verse they precede; a heading after a chapter's last
// verse attaches to that verse as a subscription. A verse with notes but no
// text (the WEB's way of marking a verse it leaves out) gets no record: its
// notes move to the end of the verse before it.
//
// Each verse also records how it starts: on a new paragraph or stanza where
// the source has a line break (or a pilcrow) before it, on a new line where
// it only changes indent or follows a line of poetry at the same indent, and
// running on from the verse before otherwise.
export function normalizeTranslation(
  source: HelloaoTranslation,
  options: NormalizeOptions,
): VerseRecord[] {
  const keep = options.books ? new Set(options.books) : undefined;
  const verses: VerseRecord[] = [];
  const seen = new Set<number>();

  for (const book of source.books) {
    if (keep && !keep.has(book.id)) continue;

    for (const { chapter } of book.chapters) {
      const notes = new Map(
        chapter.footnotes.map((note) => [
          note.noteId,
          options.stripFootnoteOrigin
            ? note.text.replace(/^\d+\.\d+ /, "")
            : note.text,
        ]),
      );
      // Psalm 119 is an acrostic: the Hebrew letter over each stanza is a
      // heading, which the WEB source marks up as a psalm title before verse
      // 1 and as descriptive text at the end of each stanza's last verse.
      const acrostic = book.id === "PSA" && chapter.number === 119;
      let pending: Heading[] = [];
      let last: VerseRecord | undefined;
      // The indent the text before the next verse ended at; undefined at the
      // start of the chapter and after a heading, where a block starts anyway.
      let levelBefore: number | undefined;
      let breakBefore = false;

      for (const item of chapter.content) {
        if (item.type === "heading") {
          pending.push({ kind: "section", text: item.content.join(" ") });
          levelBefore = undefined;
        } else if (item.type === "line_break") {
          breakBefore = true;
        } else if (item.type === "hebrew_subtitle") {
          const { text, footnotes } = flattenInline(item.content, notes);
          pending.push({
            kind: acrostic ? "section" : "superscription",
            text,
            ...(footnotes.length > 0 && { footnotes }),
          });
          levelBefore = undefined;
        } else if (item.type === "verse") {
          const content = [...item.content];
          const next: Heading[] = [];
          for (;;) {
            const tail = content.at(-1);
            if (!acrostic || typeof tail !== "object" || !("descriptive" in tail)) break;
            next.unshift({ kind: "section", text: tail.text });
            content.pop();
          }

          const where = `${book.id} ${chapter.number}:${item.number}`;
          const flat = flattenInline(content, notes);
          let pilcrow = false;
          if (options.pilcrowParagraphs) {
            const mark = /^¶\s*/.exec(flat.text)?.[0].length ?? 0;
            pilcrow = mark > 0;
            dropPrefix(flat, mark);
          }
          breakBefore ||= flat.leadingBreak;

          if (flat.text === "") {
            if (!last) throw new Error(`${where} is empty and has no verse before it`);
            for (const note of flat.footnotes) {
              last.footnotes.push({ ...note, offset: last.text.length });
            }
          } else {
            const verseId = canonicalVerseId(options.translationId, {
              usfm: book.id,
              chapter: chapter.number,
              verse: item.number,
            });
            if (seen.has(verseId)) {
              throw new Error(`${where} maps to verse id ${verseId}, already used`);
            }
            seen.add(verseId);

            const level = flat.firstLevel!;
            const paragraph =
              pilcrow ||
              (breakBefore &&
                (levelBefore === undefined || opensParagraph(levelBefore, level)));
            const line =
              levelBefore !== undefined && (breakBefore || levelBefore !== level);
            const start: Break[] = paragraph
              ? [{ offset: 0, kind: "paragraph" }]
              : line
                ? [{ offset: 0, kind: "line" }]
                : [];

            last = {
              verseId,
              text: flat.text,
              headings: pending,
              footnotes: flat.footnotes,
              breaks: [...start, ...flat.breaks],
              wordsOfJesus: flat.wordsOfJesus,
            };
            verses.push(last);
            pending = [];
            levelBefore = flat.lastLevel;
            breakBefore = flat.trailingBreak;
          }
          if (next.length > 0) levelBefore = undefined;
          pending.push(...next);
        }
      }

      if (pending.length > 0) {
        if (!last) {
          throw new Error(`${book.id} ${chapter.number} has headings but no verses`);
        }
        last.headings.push(
          ...pending.map((heading) => ({ ...heading, kind: "subscription" as const })),
        );
      }
    }
  }

  return verses.sort((a, b) => a.verseId - b.verseId);
}
