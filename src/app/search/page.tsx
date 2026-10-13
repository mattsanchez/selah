import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReaderShell } from "@/components/reader/reader-shell";
import { SearchFilters } from "@/components/search/search-filters";
import { SearchResults } from "@/components/search/search-results";
import { getDb } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import { MAX_QUERY_LENGTH, searchVerses } from "@/lib/bible/search";
import { readerPath } from "@/lib/reader-url";
import {
  SEARCH_PAGE_SIZE,
  interpretQuery,
  parsePage,
  parseScope,
  readerTranslations,
  scopeName,
  scopeRanges,
  searchPath,
  searchTranslationParam,
  selectSearchTranslations,
} from "@/lib/search-url";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/search">;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const typed = (value: string | string[] | undefined) =>
  (first(value) ?? "").trim().slice(0, MAX_QUERY_LENGTH);

const EXAMPLES = ["living water", "“good shepherd”", "grace -law", "Psalm 23"];

const muted = "text-stone-600 dark:text-stone-400";
const link =
  "underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = typed((await searchParams).q);
  return { title: q ? `${q} · Search` : "Search" };
}

// Where the one box submits. A reference goes straight to the reader;
// anything else is a keyword search of the local translations, narrowed by
// the `t`, `in` and `page` parameters. See src/lib/search-url.ts for the URLs.
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typed(params.q);

  const intent = interpretQuery(q);
  if (intent.kind === "reference") {
    redirect(readerPath(intent.ranges, readerTranslations(params.t)));
  }

  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  // Only text stored here can be searched; see "Licensed translations" in docs/spec.md.
  const translations = (await listTranslations(db, defaultId)).filter(
    (translation) => translation.provider === "local",
  );
  const ids = translations.map((translation) => translation.id);
  const selected = selectSearchTranslations(params.t, ids, defaultId);
  const t = searchTranslationParam(selected, ids, defaultId);
  const scope = parseScope(first(params.in));
  const page = parsePage(first(params.page));

  if (intent.kind !== "keyword") {
    return (
      <ReaderShell
        form={{ value: q, t, error: intent.kind === "bad-reference" ? intent.message : undefined }}
      >
        <div className="mt-10">
          <h1 className="font-serif text-3xl tracking-tight">Search the Bible</h1>
          <p className={`mt-3 ${muted}`}>
            Type words to find the verses that have them, or a reference to open the passage.
            Put a phrase in quotation marks, and a minus sign before a word to leave it out.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <Link
                  href={searchPath({ q: example, t })}
                  className="inline-flex h-9 items-center rounded-md border border-stone-300 px-3 text-sm hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:hover:bg-stone-900"
                >
                  {example}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </ReaderShell>
    );
  }

  const results = await searchVerses(db, {
    query: q,
    translationIds: selected,
    ranges: scopeRanges(scope),
    limit: SEARCH_PAGE_SIZE,
    offset: (page - 1) * SEARCH_PAGE_SIZE,
  });
  const pages = Math.ceil(results.total / SEARCH_PAGE_SIZE);
  // A page past the end, as an old link may be: show the last one.
  if (results.total > 0 && page > pages) redirect(searchPath({ q, t, scope, page: pages }));

  const where = [
    scope && scopeName(scope),
    selected.length === ids.length && ids.length > 1
      ? "all translations"
      : `the ${selected.map((id) => translations.find((tr) => tr.id === id)!.abbrev).join(", ")}`,
  ]
    .filter(Boolean)
    .join(", ");
  const firstHit = (page - 1) * SEARCH_PAGE_SIZE + 1;
  const count = `${results.total.toLocaleString("en")} ${results.total === 1 ? "verse" : "verses"}`;

  return (
    <ReaderShell form={{ value: q, t }}>
      <div className="mt-10">
        <h1 className="font-serif text-3xl tracking-tight">
          Search: <span className="break-words">{q}</span>
        </h1>

        {intent.book && (
          <p className={`mt-3 text-sm ${muted}`}>
            Looking for the book?{" "}
            <Link href={readerPath(intent.book, readerTranslations(params.t))} className={link}>
              Read {formatReference(intent.book)}
            </Link>
          </p>
        )}

        {translations.length === 0 ? (
          <p role="status" className={`mt-6 ${muted}`}>
            No translations are loaded yet. Run <code>pnpm import:bible</code> to load them.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <SearchFilters
                q={q}
                translations={translations.map(({ id, abbrev, name }) => ({ id, abbrev, name }))}
                selected={selected}
                defaultId={defaultId}
                scope={scope}
              />
            </div>

            <p role="status" data-search-status className={`mt-6 text-sm ${muted}`}>
              {!results.searchable
                ? "Every word in that search is too common to look for on its own. Add a more distinctive word."
                : results.total === 0
                  ? `No verses match in ${where}.`
                  : pages > 1
                    ? `${count} in ${where}. Showing ${firstHit}–${firstHit + results.hits.length - 1}.`
                    : `${count} in ${where}.`}
            </p>

            {results.searchable && results.total === 0 && (
              <ul className={`mt-3 list-disc space-y-1 pl-5 text-sm ${muted}`}>
                <li>Every word has to be in the verse; try fewer words, or check the spelling.</li>
                {scope && (
                  <li>
                    <Link href={searchPath({ q, t })} className={link}>
                      Search the whole Bible
                    </Link>
                  </li>
                )}
                {selected.length < ids.length && (
                  <li>
                    <Link href={searchPath({ q, t: "all", scope })} className={link}>
                      Search all translations
                    </Link>
                  </li>
                )}
              </ul>
            )}

            {results.hits.length > 0 && (
              <div className="mt-6">
                <SearchResults
                  hits={results.hits}
                  translations={translations}
                  defaultId={defaultId}
                />
              </div>
            )}

            {pages > 1 && (
              <nav
                aria-label="Pages of results"
                className="mt-8 flex items-center justify-between font-sans text-sm"
              >
                {page > 1 ? (
                  <Link
                    href={searchPath({ q, t, scope, page: page - 1 })}
                    rel="prev"
                    className={link}
                  >
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className={muted}>
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link
                    href={searchPath({ q, t, scope, page: page + 1 })}
                    rel="next"
                    className={link}
                  >
                    Next
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </ReaderShell>
  );
}
