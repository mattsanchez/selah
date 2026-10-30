import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference } from "@/lib/bible/reference";
import { isVerseId, type VerseRange } from "@/lib/bible/verse-id";
import { readerPath } from "@/lib/reader-url";

import { makeQuote, shortenQuote, type SourceQuote, type StoredSource } from "./quote";

// What the model writes, read as it is written. docs/ask.md is the contract:
//
//   ## What the text says
//   ... [[43003016]] ... [[43003016-43003018]] ...
//
//   ## Interpretation
//   ... [[c1]] ...
//   <quote source="c2">words of the source</quote>
//
// Nothing the model writes becomes a link or an attribution as it stands.
// A citation is linked only when its verses were in the context the model was
// given, a quote is shown only when its words are in the entry it names, and
// who said it and under what license come from that entry. Whatever fails is
// left out and counted, so the page can say so.

export const SECTIONS = [
  { id: "text", title: "What the text says" },
  { id: "interpretation", title: "Interpretation" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export type AnswerSegment =
  | { type: "text"; text: string }
  // Verses, linked into the reader.
  | { type: "cite"; range: VerseRange; reference: string; href: string }
  // A commentary or study note cited without quoting it.
  | { type: "source"; id: string; label: string; reference: string; href: string }
  | { type: "quote"; quote: SourceQuote };

export type Dropped = {
  kind: "citation" | "quote";
  // What the model wrote, cut short.
  written: string;
};

export type Answer = {
  sections: { id: SectionId; title: string; segments: AnswerSegment[] }[];
  dropped: Dropped[];
};

export type AnswerEvent =
  | { type: "section"; id: SectionId }
  | { type: "segment"; segment: AnswerSegment }
  | { type: "dropped"; dropped: Dropped };

// What the model may cite: the context, reduced to what these checks need.
export type Citable = {
  // Every verse whose text the model was given.
  verses: readonly VerseRange[];
  // The ranges it was given as one item. Its id may be cited whole, though a
  // translation that leaves out a verse of it leaves a gap in `verses`.
  items?: readonly VerseRange[];
  // The commentary and notes it was given, by the id it was given them under.
  sources: ReadonlyMap<string, { source: StoredSource; label: string; reference: string; href: string; text: string }>;
  // The translation of the reader's links, when it is not the default.
  t?: string;
};

export const emptyAnswer = (): Answer => ({
  sections: SECTIONS.map(({ id, title }) => ({ id, title, segments: [] })),
  dropped: [],
});

// Applies an event; the server and the page build the same answer this way.
export function applyEvent(answer: Answer, section: SectionId | undefined, event: AnswerEvent): SectionId | undefined {
  if (event.type === "section") return event.id;
  if (event.type === "dropped") {
    answer.dropped.push(event.dropped);
    return section;
  }
  const segments = answer.sections.find((each) => each.id === section)?.segments;
  if (!segments) return section;
  const last = segments.at(-1);
  if (event.segment.type === "text" && last?.type === "text") last.text += event.segment.text;
  else segments.push(event.segment);
  return section;
}

// Whether both sections were written. An answer that is not is not saved.
export function followsContract(answer: Answer): boolean {
  return answer.sections.every((section) =>
    section.segments.some((segment) => segment.type !== "text" || segment.text.trim()),
  );
}

// The verses of a citation: ids, a range of ids, or a reference the reader
// can read. Undefined when it is none of those.
function citedRanges(inner: string): VerseRange[] | undefined {
  const parts = inner.split(/[,;]/).map((part) => part.trim());
  const ids = parts.map((part) => /^(\d{7,8})(?:\s*[-–]\s*(\d{7,8}))?$/.exec(part));
  if (ids.every(Boolean)) {
    const ranges = ids.map((match) => ({ start: Number(match![1]), end: Number(match![2] ?? match![1]) }));
    return ranges.every(({ start, end }) => isVerseId(start) && isVerseId(end) && start <= end) ? ranges : undefined;
  }
  const parsed = parseReference(inner);
  return parsed.ok ? parsed.ranges : undefined;
}

const within = (range: VerseRange, allowed: readonly VerseRange[]) =>
  allowed.some(({ start, end }) => start <= range.start && range.end <= end);

// For comparing a quote with its source: the same words, however they are
// spaced and whichever quotation marks and dashes were typed.
const fold = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

// Where `piece` is in `text` from `from` on, as whole words: "sin" is not in
// "single". -1 when it is not.
function wholeWordsAt(text: string, piece: string, from: number): number {
  for (let at = text.indexOf(piece, from); at >= 0; at = text.indexOf(piece, at + 1)) {
    const before = text[at - 1] ?? " ";
    const after = text[at + piece.length] ?? " ";
    if (!WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after)) return at;
  }
  return -1;
}

// The words of a quote when they are in the source, in order, with "[…]"
// wherever the quote skips some. Undefined when they are not.
export function verifyQuote(written: string, source: string): { text: string; shortened: boolean } | undefined {
  const pieces = written.split(/\s*(?:\[…\]|\[\.\.\.\]|…|\.\.\.)\s*/);
  const words = pieces.map((piece) => piece.trim()).filter(Boolean);
  if (words.length === 0) return undefined;
  const folded = fold(source);
  let from = 0;
  for (const piece of words) {
    const at = wholeWordsAt(folded, fold(piece), from);
    if (at < 0) return undefined;
    from = at + fold(piece).length;
  }
  const opens = !pieces[0].trim();
  const closes = !pieces.at(-1)!.trim();
  const joined = `${opens ? "[…] " : ""}${words.join(" […] ")}${closes ? " […]" : ""}`;
  const short = shortenQuote(joined);
  return { text: short.text, shortened: short.shortened || words.length > 1 || opens || closes };
}

const clip = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

// A token we have the start of may still be arriving. These are how long one
// can be before it is taken for something else.
const MAX_CITATION = 120;
const MAX_QUOTE = 4_000;

// Reads what the model writes, a piece at a time, into events. A marker cut
// in two between pieces waits for the rest; text is passed on as it comes.
export class AnswerParser {
  private buffer = "";
  private lineStart = true;
  private afterHeading = false;
  private section: SectionId | undefined;
  private readonly verses: VerseRange[];

  constructor(private readonly citable: Citable) {
    this.verses = normalizeRanges(citable.verses);
  }

  push(text: string): AnswerEvent[] {
    this.buffer += text;
    return this.read(false);
  }

  end(): AnswerEvent[] {
    return this.read(true);
  }

  private text(written: string): AnswerEvent[] {
    // The blank line after a heading may come in a piece of its own.
    const text = this.afterHeading ? written.trimStart() : written;
    if (!written) return [];
    this.lineStart = written.endsWith("\n");
    if (!text) return [];
    this.afterHeading = false;
    // What comes before the first heading is not part of the contract.
    return this.section ? [{ type: "segment", segment: { type: "text", text } }] : [];
  }

  private read(final: boolean): AnswerEvent[] {
    const events: AnswerEvent[] = [];
    for (;;) {
      const at = this.nextToken();
      if (at === undefined) {
        // Nothing to act on: keep only a tail that may yet become a token.
        const tail = final ? "" : (/(?:\[|<q?u?o?t?e?|\n[ \t]*#*|\n)$/.exec(this.buffer)?.[0] ?? "");
        const keep = !final && this.lineStart && /^[ \t]*#*$/.test(this.buffer) ? this.buffer : tail;
        const text = this.buffer.slice(0, this.buffer.length - keep.length);
        events.push(...this.text(text));
        this.buffer = keep;
        return events;
      }
      events.push(...this.text(this.buffer.slice(0, at)));
      this.buffer = this.buffer.slice(at);
      const token = this.token(final);
      if (!token) return events;
      events.push(...token);
    }
  }

  // Where the next heading or marker starts in the buffer.
  private nextToken(): number | undefined {
    if (this.lineStart && /^[ \t]*#{1,6}[ \t]/.test(this.buffer)) return 0;
    const marker = /\[\[|<quote\b|\n[ \t]*#{1,6}[ \t]/.exec(this.buffer);
    if (!marker) return undefined;
    return marker[0].startsWith("\n") ? marker.index + 1 : marker.index;
  }

  // Reads the token at the start of the buffer. Undefined: it is not all here.
  private token(final: boolean): AnswerEvent[] | undefined {
    if (this.buffer.startsWith("[[")) return this.citation(final);
    if (this.buffer.startsWith("<quote")) return this.quote(final);
    return this.heading(final);
  }

  private heading(final: boolean): AnswerEvent[] | undefined {
    const end = this.buffer.indexOf("\n");
    if (end < 0 && !final) return undefined;
    const line = end < 0 ? this.buffer : this.buffer.slice(0, end);
    const title = line.replace(/^[ \t]*#+[ \t]*/, "").replace(/[\s:*]+$/, "").toLowerCase();
    const known = SECTIONS.find((section) => section.title.toLowerCase() === title);
    this.buffer = this.buffer.slice(line.length).replace(/^\s+/, "");
    this.lineStart = true;
    if (known) {
      this.section = known.id;
      this.afterHeading = true;
      return [{ type: "section", id: known.id }];
    }
    return this.text(`${line.replace(/^[ \t]*#+[ \t]*/, "")}\n\n`);
  }

  private citation(final: boolean): AnswerEvent[] | undefined {
    const end = this.buffer.indexOf("]]");
    if (end < 0) {
      if (!final && this.buffer.length < MAX_CITATION) return undefined;
      // Not a citation: its brackets are only text.
      const text = this.buffer.slice(0, 2);
      this.buffer = this.buffer.slice(2);
      return this.text(text);
    }
    const inner = this.buffer.slice(2, end).trim();
    this.buffer = this.buffer.slice(end + 2);
    this.lineStart = false;
    this.afterHeading = false;
    if (!this.section) return [];

    const source = this.citable.sources.get(inner);
    if (source) {
      const { label, reference, href } = source;
      return [{ type: "segment", segment: { type: "source", id: inner, label, reference, href } }];
    }
    const ranges = citedRanges(inner);
    const given = (range: VerseRange) =>
      within(range, this.verses) ||
      this.citable.items?.some(({ start, end }) => start === range.start && end === range.end);
    if (!ranges?.every(given)) {
      return [{ type: "dropped", dropped: { kind: "citation", written: clip(inner) } }];
    }
    return ranges.map((range) => ({
      type: "segment",
      segment: {
        type: "cite",
        range,
        reference: formatReference([range]),
        href: readerPath([range], this.citable.t),
      },
    }));
  }

  private quote(final: boolean): AnswerEvent[] | undefined {
    const close = "</quote>";
    const end = this.buffer.indexOf(close);
    if (end < 0) {
      if (!final && this.buffer.length < MAX_QUOTE) return undefined;
      const written = this.buffer;
      this.buffer = "";
      return this.section ? [{ type: "dropped", dropped: { kind: "quote", written: clip(written) } }] : [];
    }
    const whole = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + close.length);
    this.lineStart = false;
    this.afterHeading = false;
    if (!this.section) return [];

    const open = /^<quote\s+source="([^"]*)"[^>]*>/.exec(whole);
    const words = open ? whole.slice(open[0].length) : "";
    const refused: AnswerEvent[] = [{ type: "dropped", dropped: { kind: "quote", written: clip(words || whole) } }];
    // A commentator's words are interpretation, whoever wrote them.
    if (!open || this.section !== "interpretation") return refused;
    const entry = this.citable.sources.get(open[1]);
    const verified = entry && verifyQuote(words, entry.text);
    if (!entry || !verified) return refused;
    return [{ type: "segment", segment: { type: "quote", quote: makeQuote(entry.source, entry, verified) } }];
  }
}

// A whole answer at once.
export function parseAnswer(written: string, citable: Citable): Answer {
  const parser = new AnswerParser(citable);
  const answer = emptyAnswer();
  let section: SectionId | undefined;
  for (const event of [...parser.push(written), ...parser.end()]) section = applyEvent(answer, section, event);
  return answer;
}

// The answer as plain words: what a follow-up question sends back as the turn before.
export function answerText(answer: Answer): string {
  return answer.sections
    .map(({ title, segments }) => {
      const body = segments
        .map((segment) => {
          if (segment.type === "text") return segment.text;
          if (segment.type === "quote") return `"${segment.quote.text}" (${segment.quote.label})`;
          return `(${segment.type === "source" ? segment.label : segment.reference})`;
        })
        .join("");
      return `## ${title}\n\n${body.trim()}`;
    })
    .join("\n\n");
}
