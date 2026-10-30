import { and, between, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { verse } from "@/db/schema";
import type { AiProvider } from "@/lib/ai/types";
import { fusePassages, type FusedPassage } from "@/lib/embeddings/fusion";
import { embeddedTranslations, nearestWindows } from "@/lib/embeddings/passages";
import { embedQuery } from "@/lib/embeddings/query";

import type { Heading } from "./types";
import type { VerseRange } from "./verse-id";

// Search over the verses stored locally. searchVerses() is the one place
// retrieval and ranking happen: the search page hands it a request and prints
// the hits in the order they come back. Keyword ranking is Postgres full-text
// search over `verse.search` (the verse's words and its headings, English
// stemming). Meaning ranking is nearness to the verse windows' vectors, and
// "both" is the two lists fused (src/lib/embeddings/fusion.ts).
//
// Without a provider, without vectors for the translations asked for, or when
// the query cannot be embedded, every mode is the keyword search.

export type SearchMode = "keyword" | "meaning" | "both";

export const SEARCH_MODES: readonly SearchMode[] = ["keyword", "meaning", "both"];

export type SearchRequest = {
  // What was typed, in the syntax of websearch_to_tsquery: words that must
  // all match, "quoted phrases", `or` between alternatives, -word to exclude.
  // Anything else is read as plain words; no input is a syntax error.
  query: string;
  // The translations to search, in the order that breaks ties.
  translationIds: readonly string[];
  // Only verses inside one of these ranges: a book, a testament. Everything
  // when absent.
  ranges?: readonly VerseRange[];
  limit?: number;
  offset?: number;
  // How to rank; "keyword" when absent, and always without `provider`.
  mode?: SearchMode;
  provider?: Pick<AiProvider, "name" | "embed" | "embeddingModel" | "minSimilarity">;
};

// A stretch of text; `match` marks words the query matched.
export type Segment = { text: string; match: boolean };

export type SearchHit = {
  translationId: string;
  verseId: number;
  // The last verse, when the hit is a passage of several (a verse window).
  endVerseId?: number;
  // The verse's text on one line (line breaks become spaces), cut into
  // matched and unmatched stretches. A hit found some other way than by its
  // words has a single unmatched segment.
  text: Segment[];
  // The headings printed with the verse that the query matched, such as a
  // psalm's title. Empty when the match is in the text alone.
  headings: { kind: Heading["kind"]; text: Segment[] }[];
  // Higher is better; only comparable within one result set.
  score: number;
};

export type SearchResults = {
  // Best first; ties in reading order, then in the order of `translationIds`.
  hits: SearchHit[];
  // How many verses match in all, for paging.
  total: number;
  // False when the query has nothing to search for: it is empty, or every
  // word in it is too common to be indexed ("the", "I am").
  searchable: boolean;
  // How the hits were ranked, when that was not by keyword alone.
  mode?: Exclude<SearchMode, "keyword">;
  // How many verses have the words, when that is more than could be ranked
  // with the vectors: the hits are then the best of them, not all of them.
  keywordTotal?: number;
};

export const DEFAULT_SEARCH_LIMIT = 20;
// How far down each list fusion looks.
export const KEYWORD_CANDIDATES = 200;
export const VECTOR_CANDIDATES = 100;
// Longer input is cut off here; nobody types a query this long.
export const MAX_QUERY_LENGTH = 200;

// Private-use characters, which no translation's text contains, wrapped by
// ts_headline around each matched word.
const START = "";
const STOP = "";
const HEADLINE = `HighlightAll=true, StartSel=${START}, StopSel=${STOP}`;

// Cuts the output of ts_headline into matched and unmatched stretches.
export function splitHeadline(headline: string): Segment[] {
  const segments: Segment[] = [];
  headline.split(START).forEach((piece, i) => {
    // Every piece but the first opens with a match, up to its STOP.
    const stop = i === 0 ? -1 : piece.indexOf(STOP);
    const matched = piece.slice(0, Math.max(stop, 0));
    const rest = piece.slice(stop + 1).replaceAll(STOP, "");
    if (matched) segments.push({ text: matched, match: true });
    if (rest) segments.push({ text: rest, match: false });
  });
  return segments;
}

// The query as Postgres is given it. Phones and word processors type curly
// quotation marks, which websearch_to_tsquery does not read as a phrase.
export function normalizeQuery(query: string): string {
  return query.replace(/[“”„‟«»]/g, '"').trim().slice(0, MAX_QUERY_LENGTH);
}

// The ids of `translationIds` in array order, for breaking ties.
const translationOrder = (translationIds: readonly string[], translationId: SQL | typeof verse.translationId) =>
  sql`array_position(array[${sql.join(
    translationIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[], ${translationId})`;

const headlineOf = (query: SQL) =>
  sql<string>`ts_headline('english', regexp_replace(${verse.text}, '\\s+', ' ', 'g'), ${query}, ${HEADLINE})`;

const headingHeadlinesOf = (query: SQL) =>
  sql<string[]>`ts_headline('english', jsonb_path_query_array(${verse.headings}, '$[*].text'), ${query}, ${HEADLINE})`;

function keywordWhere(query: SQL, request: SearchRequest, translationIds: readonly string[]) {
  return and(
    sql`${verse.search} @@ ${query}`,
    inArray(verse.translationId, [...translationIds]),
    request.ranges?.length
      ? or(...request.ranges.map((range) => between(verse.verseId, range.start, range.end)))
      : undefined,
  );
}

// The headings that show the query matched them.
function matchedHeadings(headings: Heading[], headlines: string[]) {
  return headings
    .map((heading, i) => ({
      kind: heading.kind,
      text: splitHeadline(headlines[i] ?? heading.text),
    }))
    .filter((heading) => heading.text.some((segment) => segment.match));
}

async function keywordSearch(
  db: Db,
  request: SearchRequest,
  query: SQL,
  translationIds: readonly string[],
): Promise<SearchResults> {
  const where = keywordWhere(query, request, translationIds);

  // Rank and cut to a page first, so that only the page is highlighted.
  const score = sql<number>`ts_rank_cd(${verse.search}, ${query})`;
  const page = db
    .select({
      translationId: verse.translationId,
      verseId: verse.verseId,
      score: score.as("score"),
    })
    .from(verse)
    .where(where)
    .orderBy(desc(score), verse.verseId, translationOrder(translationIds, verse.translationId))
    .limit(request.limit ?? DEFAULT_SEARCH_LIMIT)
    .offset(request.offset ?? 0)
    .as("page");

  const [rows, total] = await Promise.all([
    db
      .select({
        translationId: page.translationId,
        verseId: page.verseId,
        score: page.score,
        text: headlineOf(query),
        headingTexts: headingHeadlinesOf(query),
        headings: verse.headings,
      })
      .from(page)
      .innerJoin(
        verse,
        and(eq(verse.translationId, page.translationId), eq(verse.verseId, page.verseId)),
      )
      .orderBy(desc(page.score), page.verseId, translationOrder(translationIds, sql`${page.translationId}`)),
    db.$count(verse, where),
  ]);

  return {
    total,
    searchable: true,
    hits: rows.map((row) => ({
      translationId: row.translationId,
      verseId: row.verseId,
      score: Number(row.score),
      text: splitHeadline(row.text),
      headings: matchedHeadings(row.headings, row.headingTexts),
    })),
  };
}

// The fused passages of one page, as hits: every verse of a passage on one
// line, with the query's words marked where keyword search found the passage.
async function passageHits(
  db: Db,
  passages: readonly FusedPassage[],
  query: SQL | undefined,
): Promise<SearchHit[]> {
  if (passages.length === 0) return [];
  const rows = await db
    .select({
      translationId: verse.translationId,
      verseId: verse.verseId,
      text: query ? headlineOf(query) : sql<string>`regexp_replace(${verse.text}, '\\s+', ' ', 'g')`,
      headingTexts: query ? headingHeadlinesOf(query) : sql<string[]>`'[]'::jsonb`,
      headings: verse.headings,
    })
    .from(verse)
    .where(
      or(
        ...passages.map((passage) =>
          and(eq(verse.translationId, passage.translationId), between(verse.verseId, passage.start, passage.end)),
        ),
      ),
    )
    .orderBy(verse.verseId);

  return passages.map((passage) => {
    const verses = rows.filter(
      (row) =>
        row.translationId === passage.translationId &&
        row.verseId >= passage.start &&
        row.verseId <= passage.end,
    );
    const marked = query !== undefined && passage.keyword;
    const line = verses.map((row) => row.text).join(" ");
    return {
      translationId: passage.translationId,
      verseId: passage.start,
      ...(passage.end !== passage.start && { endVerseId: passage.end }),
      score: passage.score,
      text: marked
        ? splitHeadline(line)
        : [{ text: line.replaceAll(START, "").replaceAll(STOP, ""), match: false }],
      headings: marked ? verses.flatMap((row) => matchedHeadings(row.headings, row.headingTexts)) : [],
    };
  });
}

// Meaning or both, or undefined when this search can only go by keyword.
async function rankedSearch(
  db: Db,
  request: SearchRequest,
  mode: Exclude<SearchMode, "keyword">,
  text: string,
  query: SQL,
  searchableWords: boolean,
  translationIds: readonly string[],
): Promise<SearchResults | undefined> {
  const { provider } = request;
  const model = provider?.embeddingModel;
  if (!provider || !model) return undefined;
  const embedded = await embeddedTranslations(db, model, translationIds);
  if (embedded.length === 0) return undefined;
  const vector = await embedQuery(provider, text);
  if (!vector) return undefined;

  const windows = await nearestWindows(db, vector, {
    model,
    translationIds: embedded,
    ranges: request.ranges,
    minSimilarity: provider.minSimilarity,
    limit: VECTOR_CANDIDATES,
  });

  // Nothing near, and no words to go on: as much as saying so.
  if (windows.length === 0 && !searchableWords) return undefined;

  const words = mode === "both" && searchableWords;
  const where = keywordWhere(query, request, translationIds);
  const [verses, keywordTotal] = words
    ? await Promise.all([
        db
          .select({ translationId: verse.translationId, verseId: verse.verseId })
          .from(verse)
          .where(where)
          .orderBy(
            desc(sql`ts_rank_cd(${verse.search}, ${query})`),
            verse.verseId,
            translationOrder(translationIds, verse.translationId),
          )
          .limit(KEYWORD_CANDIDATES),
        db.$count(verse, where),
      ])
    : [[], 0];

  const fused = fusePassages(verses, windows);
  const offset = request.offset ?? 0;
  const page = fused.slice(offset, offset + (request.limit ?? DEFAULT_SEARCH_LIMIT));
  return {
    total: fused.length,
    searchable: true,
    mode,
    ...(keywordTotal > verses.length && { keywordTotal }),
    hits: await passageHits(db, page, words ? query : undefined),
  };
}

export async function searchVerses(db: Db, request: SearchRequest): Promise<SearchResults> {
  const text = normalizeQuery(request.query);
  const translationIds = [...new Set(request.translationIds)];
  const none = { hits: [], total: 0 };
  if (!text || translationIds.length === 0) return { ...none, searchable: text !== "" };

  // The query is always a bound parameter; websearch_to_tsquery never raises
  // on what it is given.
  const query = sql`websearch_to_tsquery('english', ${text})`;
  const [{ nodes }] = await db.execute<{ nodes: number }>(sql`select numnode(${query}) as nodes`);

  const { mode = "keyword" } = request;
  if (mode !== "keyword") {
    const ranked = await rankedSearch(db, request, mode, text, query, nodes > 0, translationIds);
    if (ranked) return ranked;
  }
  if (nodes === 0) return { ...none, searchable: false };
  return keywordSearch(db, request, query, translationIds);
}
