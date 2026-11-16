import { and, asc, between, count, eq, inArray } from "drizzle-orm";

import type { Db } from "@/db/client";
import { commentaryEntry, translation, verse } from "@/db/schema";
import { SHARE_ALIKE_SOURCES, type ShareAlikeSource } from "@/lib/ask/sources";
import { BOOKS } from "@/lib/bible/books";
import { formatReference } from "@/lib/bible/reference";
import { bookRange } from "@/lib/bible/verse-id";
import { renderMarkdown } from "@/lib/items/markdown";
import { shareAlikeQuotes } from "@/lib/items/share-alike";
import { readerPath } from "@/lib/reader-url";
import { decodeEntities, studyText } from "@/lib/study/html";

import { MATCH_WORDS, RunIndex, matchedRuns, readWords, runKeys } from "./source-words";

// Words of a share-alike source's notes in a post, outside a quote that
// credits the source: what the editor warns about before the post is
// published, and while a published one is edited. A warning only. Nothing
// here edits a post or stops one being published.
//
// It finds copies, not paraphrase: MATCH_WORDS words in a row, word for word
// (source-words.ts). A run the notes share with a Bible translation in the
// database is left out, so quoting Scripture is never taken for quoting a note.

// A note whose words the post has.
export type UncreditedMatch = {
  sourceId: string;
  // "Tyndale Open Study Notes", its license and its publisher's page.
  source: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  // The passage the note is on, and the note in the reader's study panel.
  reference: string;
  href: string;
  // How many of the post's words are the note's, and the first run of them.
  words: number;
  excerpt: string;
};

export type UncreditedCheck =
  // The notes are not in the database (or not yet), so nothing was compared.
  | { checked: false; matches: [] }
  | { checked: true; matches: UncreditedMatch[] };

// At most this many notes are named in one warning.
const MAX_MATCHES = 5;
const EXCERPT_WORDS = 16;
// At most this many notes are compared word by word with one post.
const MAX_CANDIDATES = 40;

// --- The post's words that no quote credits ---

// A post's rendered HTML, with the top-level blockquotes that name `source`
// taken out. Written HTML is escaped by renderMarkdown, so every
// "<blockquote" is a real one.
function withoutCreditingQuotes(html: string, source: ShareAlikeSource): string {
  let depth = 0;
  let out = "";
  let last = 0;
  let opened = 0;
  for (const tag of html.matchAll(/<(\/?)blockquote\b[^>]*>/g)) {
    if (tag[1]) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        const quote = html.slice(opened, tag.index + tag[0].length);
        if (!blockText(quote).includes(source.name)) out += quote;
        last = tag.index + tag[0].length;
      }
    } else {
      if (depth === 0) {
        out += html.slice(last, tag.index);
        opened = tag.index;
      }
      depth++;
    }
  }
  return depth === 0 ? out + html.slice(last) : out + html.slice(opened);
}

// HTML as text, with a space wherever a block ends.
const blockText = (html: string) =>
  decodeEntities(
    html
      .replace(/<\/?(?:p|h[1-6]|li|ul|ol|blockquote|pre|br|hr|table|tr|td|th)\b[^>]*>/g, " ")
      .replace(/<[^>]+>/g, ""),
  );

// The text of a post that a quote crediting `source` does not cover. Such a
// quote counts only when the public site finds it too (shareAlikeQuotes),
// since that is what prints the source's notice with the post.
export function uncreditedText(markdown: string, source: ShareAlikeSource): string {
  const html = renderMarkdown(markdown);
  const credited = shareAlikeQuotes(markdown).some((each) => each.id === source.id);
  return blockText(credited ? withoutCreditingQuotes(html, source) : html).replace(/\s+/g, " ").trim();
}

// --- The notes, as an index kept in memory ---

// A note as stored in `commentary_entry`.
export type NoteRow = { sourceId: string; verseStart: number; verseEnd: number; html: string };

// The notes of the share-alike sources, ready to be compared with posts:
// their runs' keys (RunIndex, about 8 MB for the whole of Tyndale Open Study
// Notes) and their HTML, to check a key's match word by word.
export class SourceNotes {
  private readonly index: RunIndex;

  // `bibles`: the runKeys of each Bible translation, whose words are never
  // taken for a note's.
  constructor(
    private readonly notes: readonly NoteRow[],
    bibles: readonly Float64Array[] = [],
  ) {
    this.index = RunIndex.build(
      notes.map((note) => readWords(studyText(note.html)).map((word) => word.norm)),
      { except: bibles },
    );
  }

  get size() {
    return { notes: this.notes.length, runs: this.index.runs, bytes: this.index.bytes, excluded: this.index.excluded };
  }

  // The notes whose words are in the post outside a quote crediting them.
  matches(markdown: string): UncreditedMatch[] {
    const found: { match: UncreditedMatch; runs: [number, number][] }[] = [];
    for (const source of SHARE_ALIKE_SOURCES) {
      const text = uncreditedText(markdown, source);
      const words = readWords(text);
      const norms = words.map((word) => word.norm);
      const candidates = [...this.index.find(norms)]
        .filter(([doc]) => this.notes[doc].sourceId === source.id)
        // A post that copies a great many notes is told about the ones it
        // shares most with.
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, MAX_CANDIDATES);
      for (const [doc, positions] of candidates) {
        const note = this.notes[doc];
        // Every key that matched is checked against the note's own words.
        const runs = matchedRuns(norms, readWords(studyText(note.html)).map((word) => word.norm), positions);
        if (runs.length === 0) continue;
        const [first, last] = runs[0];
        const shown = Math.min(last, first + EXCERPT_WORDS - 1);
        const range = { start: note.verseStart, end: note.verseEnd };
        found.push({
          runs,
          match: {
            sourceId: source.id,
            source: source.name,
            license: source.license,
            licenseUrl: source.licenseUrl,
            sourceUrl: source.sourceUrl,
            reference: formatReference([range]),
            href: readerPath([range], undefined, { v: [range], full: source.id }),
            words: runs.reduce((n, [a, b]) => n + b - a + 1, 0),
            excerpt: text.slice(words[first].start, words[shown].end) + (shown < last ? " …" : ""),
          },
        });
      }
    }

    // A sentence the notes repeat (on several passages) is named once: by the
    // note that shares the most words with the post.
    found.sort((a, b) => b.match.words - a.match.words);
    const covered = new Set<string>();
    const named = found.filter(({ match, runs }) => {
      const positions = runs.flatMap(([a, b]) =>
        Array.from({ length: b - a + 1 }, (_, i) => `${match.sourceId}:${a + i}`),
      );
      if (positions.every((position) => covered.has(position))) return false;
      for (const position of positions) covered.add(position);
      return true;
    });
    // In the order they come in the post.
    named.sort((a, b) => a.runs[0][0] - b.runs[0][0]);
    return named.slice(0, MAX_MATCHES).map(({ match }) => match);
  }
}

// --- Loaded from the database ---

// One per server process, made the first time a post is checked and again
// when the notes or the Bible text in the database change. On a dev server's
// reload it is kept on globalThis, like the database pool.
const cache = globalThis as typeof globalThis & {
  selahUncredited?: { fingerprint: string; loaded: Promise<SourceNotes> };
};

const sourceIds = () => SHARE_ALIKE_SOURCES.map((source) => source.id);

// Changes when an import adds or removes notes or a translation.
async function fingerprint(db: Db): Promise<{ notes: number; key: string }> {
  const [notes] = await db
    .select({ n: count() })
    .from(commentaryEntry)
    .where(inArray(commentaryEntry.sourceId, sourceIds()));
  const [translations] = await db.select({ n: count() }).from(translation);
  return { notes: notes.n, key: `${notes.n}:${translations.n}` };
}

async function load(db: Db): Promise<SourceNotes> {
  const notes = await db
    .select({
      sourceId: commentaryEntry.sourceId,
      verseStart: commentaryEntry.verseStart,
      verseEnd: commentaryEntry.verseEnd,
      html: commentaryEntry.html,
    })
    .from(commentaryEntry)
    .where(inArray(commentaryEntry.sourceId, sourceIds()))
    .orderBy(asc(commentaryEntry.sourceId), asc(commentaryEntry.verseStart), asc(commentaryEntry.verseEnd));
  // Each book of each translation in verse order, as one text, so a
  // quotation that runs from one verse into the next is found too. A book at
  // a time, and only its runs' keys kept, so that loading stays small.
  const translations = await db.select({ id: translation.id }).from(translation);
  const bibles: Float64Array[] = [];
  for (const { id } of translations) {
    for (const book of BOOKS) {
      const { start, end } = bookRange(book.number);
      const verses = await db
        .select({ text: verse.text })
        .from(verse)
        .where(and(eq(verse.translationId, id), between(verse.verseId, start, end)))
        .orderBy(asc(verse.verseId));
      bibles.push(runKeys(verses.flatMap((row) => readWords(row.text).map((word) => word.norm))));
    }
  }
  return new SourceNotes(notes, bibles);
}

async function sourceNotes(db: Db): Promise<SourceNotes | undefined> {
  const now = await fingerprint(db);
  if (now.notes === 0) return undefined;
  if (cache.selahUncredited?.fingerprint !== now.key) {
    const loaded = load(db);
    cache.selahUncredited = { fingerprint: now.key, loaded };
    // A failed load is tried again on the next check.
    loaded.catch(() => {
      if (cache.selahUncredited?.loaded === loaded) cache.selahUncredited = undefined;
    });
  }
  return cache.selahUncredited.loaded;
}

// --- The check ---

export async function findUncredited(db: Db, markdown: string | null | undefined): Promise<UncreditedCheck> {
  // Too short to hold a run: nothing to look up. (The whole post is counted,
  // credited quotes too, which only makes this skip less often.)
  if (!markdown || readWords(markdown).length < MATCH_WORDS) return { checked: true, matches: [] };
  const notes = await sourceNotes(db);
  if (!notes) return { checked: false, matches: [] };
  return { checked: true, matches: notes.matches(markdown) };
}
