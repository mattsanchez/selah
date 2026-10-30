import type { Db } from "@/db/client";
import type { AiProvider } from "@/lib/ai/types";
import { getPassages, type Translation } from "@/lib/bible/passage";
import { normalizeRanges, rangesOverlap } from "@/lib/bible/ranges";
import { formatReference } from "@/lib/bible/reference";
import { searchVerses } from "@/lib/bible/search";
import type { VerseRange } from "@/lib/bible/verse-id";
import { embeddedTranslations, nearestWindows } from "@/lib/embeddings/passages";
import { embedQuery } from "@/lib/embeddings/query";
import { relatedPassages } from "@/lib/embeddings/related";
import { readerPath } from "@/lib/reader-url";
import { studyText } from "@/lib/study/html";
import { getCommentary, getCrossReferences, type CommentarySourceRow, type SourceCommentary } from "@/lib/study/queries";

import type { Citable } from "./answer";
import type { StoredSource } from "./quote";
import { ASK_SOURCES, sourceLabel } from "./sources";
import { anyOf, contentWords } from "./words";

// What the model is given to answer from, and nothing else: the open passage,
// its footnotes, the commentary and notes on it, its cross references, and
// passages found by meaning (by keyword without vectors). Every item has an id
// the answer can cite, and the whole has a budget. What did not fit is named,
// so the page can say what the answer did not see.

// About four characters make a token, here as in src/lib/ai/voyage.ts.
export const CHARS_PER_TOKEN = 4;
export const tokensOf = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

// How much of the budget each kind may use, in the order they are filled.
// What one kind leaves unused the next may have.
export const CONTEXT_TOKENS = 8_000;
const SHARES = { passage: 0.375, footnote: 0.05, commentary: 0.35, "cross-reference": 0.1, related: 0.075, keyword: 0.05 };

export type ContextKind = keyof typeof SHARES;

// How much of one commentary entry may go in: the parts of it nearest the question.
export const ENTRY_CHARS = 2_000;
const CROSS_REFERENCES_READ = 200;
const RELATED_READ = 4;
const KEYWORD_READ = 5;

export type VerseItem = {
  id: string;
  kind: "passage" | "cross-reference" | "related" | "keyword";
  range: VerseRange;
  reference: string;
  text: string;
};
export type FootnoteItem = { id: string; kind: "footnote"; range: VerseRange; reference: string; text: string };
export type CommentaryItem = {
  id: string;
  kind: "commentary" | "study-note";
  source: StoredSource;
  range: VerseRange;
  reference: string;
  text: string;
  // Whether this is part of the entry, not all of it.
  excerpt: boolean;
};
export type ContextItem = VerseItem | FootnoteItem | CommentaryItem;

// How many of a kind were left out.
export type LeftOut = { kind: ContextKind; count: number };

export type AskContext = {
  ranges: VerseRange[];
  reference: string;
  translation: Pick<Translation, "id" | "abbrev" | "name" | "attribution" | "sourceUrl">;
  // The reader's `t` parameter, when it is not the default translation.
  t?: string;
  items: ContextItem[];
  leftOut: LeftOut[];
};

export type ContextOptions = {
  translation: AskContext["translation"];
  t?: string;
  provider: Pick<AiProvider, "name" | "embed" | "embeddingModel" | "minSimilarity">;
  budgetTokens?: number;
};

// The words of an entry, without the reference a note opens with.
export const entryText = (html: string) => studyText(html.replace(/<span class="ref">[\s\S]*?<\/span>/g, ""));

// The parts of a long text that have the most of these words, in their own
// order, to about `limit` characters. A commentary's section on a chapter runs
// to tens of thousands of characters; only some of it is on these verses.
export function excerptFor(text: string, words: readonly string[], limit = ENTRY_CHARS): { text: string; excerpt: boolean } {
  if (text.length <= limit) return { text, excerpt: false };
  const wanted = new Set(words);
  const parts = text.split("\n").map((part, position) => ({
    part,
    position,
    score: contentWords(part).filter((word) => wanted.has(word)).length,
  }));
  const chosen: typeof parts = [];
  let length = 0;
  for (const each of [...parts].sort((a, b) => b.score - a.score || a.position - b.position)) {
    if (length + each.part.length > limit) continue;
    chosen.push(each);
    length += each.part.length + 1;
  }
  if (chosen.length === 0) return { text: text.slice(0, limit).replace(/\s+\S*$/, ""), excerpt: true };
  return { text: chosen.sort((a, b) => a.position - b.position).map((each) => each.part).join("\n"), excerpt: true };
}

// The fields of a source the rest of Ask reads.
const stored = ({ id, name, license, attribution, sourceUrl }: CommentarySourceRow): StoredSource => ({
  id,
  name,
  license,
  attribution,
  sourceUrl,
});

// The entries on the verses, of the sources Ask may read, each source's most
// specific first: a registered source is all that decides what is read.
export async function askCommentary(db: Db, ranges: readonly VerseRange[]): Promise<SourceCommentary[]> {
  const found = await Promise.all(ranges.map((range) => getCommentary(db, range)));
  const merged = new Map<string, SourceCommentary>();
  for (const { source, entries } of found.flat()) {
    if (!ASK_SOURCES[source.id]) continue;
    const group = merged.get(source.id) ?? { source, entries: [] };
    for (const entry of entries) {
      if (!group.entries.some((own) => own.verseStart === entry.verseStart && own.verseEnd === entry.verseEnd)) {
        group.entries.push(entry);
      }
    }
    merged.set(source.id, group);
  }
  const width = (entry: { verseStart: number; verseEnd: number }) => entry.verseEnd - entry.verseStart;
  const groups = [...merged.values()];
  for (const group of groups) group.entries.sort((a, b) => width(a) - width(b));
  return groups;
}

// Every source's first entry, then every source's second, and so on: a long
// commentary does not crowd out the others, so more than one tradition is heard.
function roundRobin(groups: readonly SourceCommentary[]) {
  const turns: { source: CommentarySourceRow; verseStart: number; verseEnd: number; html: string }[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.entries.length));
  for (let i = 0; i < longest; i++) {
    for (const { source, entries } of groups) {
      if (entries[i]) turns.push({ source, ...entries[i] });
    }
  }
  return turns;
}

const lineOf = (texts: readonly string[]) => texts.join(" ").replace(/\s+/g, " ").trim();

// Candidates in order of worth, kind by kind, kept while their share lasts.
class Budget {
  private readonly total: number;
  private spare = 0;
  readonly leftOut: LeftOut[] = [];

  constructor(total: number) {
    this.total = total;
  }

  // The items of a kind that fit: stops at the first that does not, since
  // the rest are worth less. Verses of the passage stop the same way.
  take<T extends { text: string }>(kind: ContextKind, candidates: readonly T[]): T[] {
    let left = Math.floor(this.total * SHARES[kind]) + this.spare;
    const kept: T[] = [];
    for (const candidate of candidates) {
      const cost = tokensOf(candidate.text);
      if (cost > left) break;
      kept.push(candidate);
      left -= cost;
    }
    this.spare = left;
    if (kept.length < candidates.length) this.leftOut.push({ kind, count: candidates.length - kept.length });
    return kept;
  }
}

// Windows close in meaning to the question and to the passage. Never throws:
// without vectors there is the keyword search.
async function meaningRanges(
  db: Db,
  ranges: readonly VerseRange[],
  question: string,
  { translation, provider }: ContextOptions,
): Promise<VerseRange[]> {
  const model = provider.embeddingModel;
  if (!model) return [];
  try {
    const span = { start: ranges[0].start, end: ranges.at(-1)!.end };
    const [embedded, vector, related] = await Promise.all([
      embeddedTranslations(db, model, [translation.id]),
      embedQuery(provider, question),
      relatedPassages(db, span, { translationId: translation.id, limit: RELATED_READ, provider }),
    ]);
    const near =
      vector && embedded.length > 0
        ? await nearestWindows(db, vector, {
            model,
            translationIds: embedded,
            except: span,
            minSimilarity: provider.minSimilarity,
            limit: RELATED_READ,
          })
        : [];
    const fromRelated = related.passages.filter((passage) => passage.sources.includes("meaning"));
    return [...near, ...fromRelated].map(({ start, end }) => ({ start, end }));
  } catch {
    return [];
  }
}

export async function buildContext(
  db: Db,
  passage: readonly VerseRange[],
  question: string,
  options: ContextOptions,
): Promise<AskContext> {
  const { translation, t, budgetTokens = CONTEXT_TOKENS } = options;
  const ranges = normalizeRanges(passage);
  const reference = formatReference(ranges);
  const budget = new Budget(budgetTokens);
  const quote = async (wanted: readonly VerseRange[]) =>
    (await getPassages(db, [translation.id], wanted)).get(translation.id) ?? wanted.map(() => []);

  // The passage, a verse at a time, so that each can be cited.
  const passageVerses = (await quote(ranges)).flat();
  const passageItems = budget.take(
    "passage",
    passageVerses.map(
      (verse): VerseItem => ({
        id: String(verse.verseId),
        kind: "passage",
        range: { start: verse.verseId, end: verse.verseId },
        reference: formatReference([{ start: verse.verseId, end: verse.verseId }]),
        text: lineOf([verse.text]),
      }),
    ),
  );
  const seen: VerseRange[] = passageVerses.map((verse) => ({ start: verse.verseId, end: verse.verseId }));
  const fresh = (range: VerseRange) => {
    if (ranges.some((own) => rangesOverlap(own, range)) || seen.some((own) => rangesOverlap(own, range))) return false;
    seen.push(range);
    return true;
  };

  const footnotes = budget.take(
    "footnote",
    passageVerses.flatMap((verse) =>
      verse.footnotes.map((note, i) => {
        const range = { start: verse.verseId, end: verse.verseId };
        const item: FootnoteItem = {
          id: `f${verse.verseId}-${i}`,
          kind: "footnote",
          range,
          reference: formatReference([range]),
          text: lineOf([note.text]),
        };
        return item;
      }),
    ),
  );

  const words = [...new Set([...contentWords(question), ...contentWords(passageItems.map((item) => item.text).join(" "))])];
  const groups = await askCommentary(db, ranges);
  const commentary = budget
    .take(
      "commentary",
      roundRobin(groups).map(({ source, verseStart, verseEnd, html }) => {
        const range = { start: verseStart, end: verseEnd };
        return {
          kind: source.kind === "study_notes" ? ("study-note" as const) : ("commentary" as const),
          source: stored(source),
          range,
          reference: formatReference([range]),
          ...excerptFor(entryText(html), words),
        };
      }),
    )
    .map((entry, i): CommentaryItem => ({ ...entry, id: `c${i + 1}` }));

  // Cross references, best voted first, each with the words it points to.
  const crossRows = (
    await Promise.all(ranges.map((range) => getCrossReferences(db, range, { limit: CROSS_REFERENCES_READ })))
  )
    .flat()
    .sort((a, b) => b.votes - a.votes);
  const crossRanges = crossRows.map((row) => ({ start: row.toStart, end: row.toEnd })).filter(fresh);
  const crossTexts = await quote(crossRanges);
  const crossReferences = budget.take(
    "cross-reference",
    crossRanges.flatMap((range, i): VerseItem[] => {
      const text = lineOf((crossTexts[i] ?? []).map((verse) => verse.text));
      return text
        ? [{ id: `${range.start}-${range.end}`, kind: "cross-reference", range, reference: formatReference([range]), text }]
        : [];
    }),
  );

  const nearRanges = (await meaningRanges(db, ranges, question, options)).filter(fresh);
  const nearTexts = await quote(nearRanges);
  const related = budget.take(
    "related",
    nearRanges.flatMap((range, i): VerseItem[] => {
      const text = lineOf((nearTexts[i] ?? []).map((verse) => verse.text));
      return text ? [{ id: `${range.start}-${range.end}`, kind: "related", range, reference: formatReference([range]), text }] : [];
    }),
  );

  // Without anything found by meaning, the question's own words.
  const query = related.length === 0 ? anyOf(question) : undefined;
  const hits = query
    ? (await searchVerses(db, { query, translationIds: [translation.id], limit: KEYWORD_READ * 2 })).hits
    : [];
  const keyword = budget.take(
    "keyword",
    hits
      .filter((hit) => fresh({ start: hit.verseId, end: hit.verseId }))
      .slice(0, KEYWORD_READ)
      .map((hit): VerseItem => {
        const range = { start: hit.verseId, end: hit.verseId };
        return {
          id: String(hit.verseId),
          kind: "keyword",
          range,
          reference: formatReference([range]),
          text: lineOf(hit.text.map((segment) => segment.text)),
        };
      }),
  );

  return {
    ranges,
    reference,
    translation,
    t,
    items: [...passageItems, ...footnotes, ...commentary, ...crossReferences, ...related, ...keyword],
    leftOut: budget.leftOut,
  };
}

// The context as what the model may cite.
export function citableOf(context: AskContext): Citable {
  const verses: VerseRange[] = [];
  const sources: Citable["sources"] = new Map(
    context.items.flatMap((item) => {
      if (item.kind !== "commentary" && item.kind !== "study-note") {
        if (item.kind !== "footnote") verses.push(item.range);
        return [];
      }
      const known = ASK_SOURCES[item.source.id];
      return [
        [
          item.id,
          {
            source: item.source,
            label: known ? sourceLabel(known) : item.source.name,
            reference: item.reference,
            href: readerPath([item.range], context.t),
            text: item.text,
          },
        ] as const,
      ];
    }),
  );
  return { verses, sources, t: context.t };
}

// What the page lists under an answer. Who wrote what and under which license,
// never the text of what was sent.
export type AskSources = {
  reference: string;
  translation: AskContext["translation"];
  verses: { reference: string; href: string; kind: VerseItem["kind"] }[];
  commentary: { id: string; label: string; work?: string; reference: string; href: string; license: string; licenseUrl?: string; attribution: string; sourceUrl: string }[];
  leftOut: LeftOut[];
};

export function sourcesOf(context: AskContext): AskSources {
  const verses = context.items.flatMap((item) =>
    item.kind === "footnote" || item.kind === "commentary" || item.kind === "study-note"
      ? []
      : [{ reference: item.reference, href: readerPath([item.range], context.t), kind: item.kind }],
  );
  const commentary = context.items.flatMap((item) => {
    if (item.kind !== "commentary" && item.kind !== "study-note") return [];
    const known = ASK_SOURCES[item.source.id];
    const { license, attribution, sourceUrl } = item.source;
    return [
      {
        id: item.id,
        label: known ? sourceLabel(known) : item.source.name,
        work: known?.work,
        reference: item.reference,
        href: readerPath([item.range], context.t),
        license,
        licenseUrl: known?.shareAlike?.licenseUrl,
        attribution,
        sourceUrl,
      },
    ];
  });
  return {
    reference: context.reference,
    translation: context.translation,
    verses,
    commentary,
    leftOut: context.leftOut,
  };
}
