import { and, between, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { verse } from "@/db/schema";

import type { Heading } from "./types";
import type { VerseRange } from "./verse-id";

// Search over the verses stored locally. searchVerses() is the one place
// retrieval and ranking happen: the search page hands it a request and prints
// the hits in the order they come back. Today the ranking is Postgres
// full-text search over `verse.search` (the verse's words and its headings,
// English stemming); meaning search (M10) adds vector ranking inside this
// function, behind the same request and result types.

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
};

// A stretch of text; `match` marks words the query matched.
export type Segment = { text: string; match: boolean };

export type SearchHit = {
  translationId: string;
  verseId: number;
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
};

export const DEFAULT_SEARCH_LIMIT = 20;
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

export async function searchVerses(db: Db, request: SearchRequest): Promise<SearchResults> {
  const text = normalizeQuery(request.query);
  const translationIds = [...new Set(request.translationIds)];
  const none = { hits: [], total: 0 };
  if (!text || translationIds.length === 0) return { ...none, searchable: text !== "" };

  // The query is always a bound parameter; websearch_to_tsquery never raises
  // on what it is given.
  const query = sql`websearch_to_tsquery('english', ${text})`;
  const [{ nodes }] = await db.execute<{ nodes: number }>(sql`select numnode(${query}) as nodes`);
  if (nodes === 0) return { ...none, searchable: false };

  const where = and(
    sql`${verse.search} @@ ${query}`,
    inArray(verse.translationId, translationIds),
    request.ranges?.length
      ? or(...request.ranges.map((range) => between(verse.verseId, range.start, range.end)))
      : undefined,
  );

  // Rank and cut to a page first, so that only the page is highlighted.
  const score = sql<number>`ts_rank_cd(${verse.search}, ${query})`;
  const order = (translationId: SQL | typeof verse.translationId) =>
    sql`array_position(array[${sql.join(
      translationIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[], ${translationId})`;
  const page = db
    .select({
      translationId: verse.translationId,
      verseId: verse.verseId,
      score: score.as("score"),
    })
    .from(verse)
    .where(where)
    .orderBy(desc(score), verse.verseId, order(verse.translationId))
    .limit(request.limit ?? DEFAULT_SEARCH_LIMIT)
    .offset(request.offset ?? 0)
    .as("page");

  const [rows, total] = await Promise.all([
    db
      .select({
        translationId: page.translationId,
        verseId: page.verseId,
        score: page.score,
        text: sql<string>`ts_headline('english', regexp_replace(${verse.text}, '\\s+', ' ', 'g'), ${query}, ${HEADLINE})`,
        headingTexts: sql<
          string[]
        >`ts_headline('english', jsonb_path_query_array(${verse.headings}, '$[*].text'), ${query}, ${HEADLINE})`,
        headings: verse.headings,
      })
      .from(page)
      .innerJoin(
        verse,
        and(eq(verse.translationId, page.translationId), eq(verse.verseId, page.verseId)),
      )
      .orderBy(desc(page.score), page.verseId, order(sql`${page.translationId}`)),
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
      headings: row.headings
        .map((heading, i) => ({
          kind: heading.kind,
          text: splitHeadline(row.headingTexts[i] ?? heading.text),
        }))
        .filter((heading) => heading.text.some((segment) => segment.match)),
    })),
  };
}
