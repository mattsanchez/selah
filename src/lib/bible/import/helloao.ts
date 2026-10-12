import type { Footnote, Heading, VerseRecord } from "../types";
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
  // The KJV marks paragraphs with a pilcrow at the start of a verse.
  stripParagraphMarks?: boolean;
  // USFM codes of the books to keep; every book when omitted.
  books?: readonly string[];
};

const CLOSING = /^[.,;:!?)\]”’—]/;
const OPENING = /[(\[“‘—]$/;
const CLAUSE_END = /[.,;:!?”’—]$/;

type TextItem = Exclude<InlineItem, string | { noteId: number } | { lineBreak: true }>;

const isNote = (item: InlineItem): item is { noteId: number } =>
  typeof item === "object" && "noteId" in item;
const isLineBreak = (item: InlineItem): item is { lineBreak: true } =>
  typeof item === "object" && "lineBreak" in item;
const asText = (item: string | TextItem): TextItem =>
  typeof item === "string" ? { text: item } : item;

// Flattens a verse's or superscription's content into plain text, with "\n"
// between lines of poetry, and the notes anchored in it.
//
// The source splits a line wherever a note marker falls, so two pieces around
// a marker may be one line or two. They are read as one line unless their
// poetic indent differs or the first piece ends a clause.
export function flattenInline(
  items: readonly InlineItem[],
  notes: ReadonlyMap<number, string>,
): { text: string; footnotes: Footnote[] } {
  let text = "";
  const footnotes: Footnote[] = [];
  let previous: TextItem | undefined;
  let noteSincePrevious = false;
  let breakPending = false;

  for (const item of items) {
    if (isNote(item)) {
      const note = notes.get(item.noteId);
      if (note === undefined) throw new Error(`Missing footnote ${item.noteId}`);
      footnotes.push({ offset: text.length, text: note });
      noteSincePrevious = true;
      continue;
    }
    if (isLineBreak(item)) {
      breakPending = true;
      continue;
    }

    const current = asText(item);
    const piece = current.text.replace(/\s+/g, " ").trim();
    if (piece === "") continue;

    if (previous) {
      const poetry = previous.poem !== undefined || current.poem !== undefined;
      const sameLine =
        !breakPending &&
        (!poetry ||
          (noteSincePrevious &&
            previous.poem === current.poem &&
            !CLAUSE_END.test(text)));
      if (!sameLine) text += "\n";
      else if (!CLOSING.test(piece) && !OPENING.test(text)) text += " ";
    }
    text += piece;
    previous = current;
    noteSincePrevious = false;
    breakPending = false;
  }

  return { text, footnotes };
}

// Converts a helloao translation into verse records with canonical ids.
// Headings attach to the verse they precede; a heading after a chapter's last
// verse attaches to that verse as a subscription. A verse with notes but no
// text (the WEB's way of marking a verse it leaves out) gets no record: its
// notes move to the end of the verse before it.
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

      for (const item of chapter.content) {
        if (item.type === "heading") {
          pending.push({ kind: "section", text: item.content.join(" ") });
        } else if (item.type === "hebrew_subtitle") {
          const { text, footnotes } = flattenInline(item.content, notes);
          pending.push({
            kind: acrostic ? "section" : "superscription",
            text,
            ...(footnotes.length > 0 && { footnotes }),
          });
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
          if (options.stripParagraphMarks) {
            const mark = /^¶\s*/.exec(flat.text)?.[0].length ?? 0;
            flat.text = flat.text.slice(mark);
            for (const note of flat.footnotes) {
              note.offset = Math.max(0, note.offset - mark);
            }
          }

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
            last = { verseId, headings: pending, ...flat };
            verses.push(last);
            pending = [];
          }
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
