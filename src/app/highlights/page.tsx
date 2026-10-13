import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HighlightCard, serverTimeZone } from "@/components/highlights/highlight-card";
import { Attribution } from "@/components/passage/passage";
import { ReaderShell } from "@/components/reader/reader-shell";
import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { bookByNumber } from "@/lib/bible/books";
import { getPassages, listTranslations, type Translation } from "@/lib/bible/passage";
import { bookRange } from "@/lib/bible/verse-id";
import {
  HIGHLIGHTS_PAGE_SIZE,
  hasFilters,
  highlightsPath,
  parseHighlightFilters,
} from "@/lib/highlights-url";
import { HIGHLIGHT_COLORS } from "@/lib/items/palette";
import { itemBooks, listItems, type Item } from "@/lib/items/queries";
import { readerPath, translationParam } from "@/lib/reader-url";
import { bookSlug } from "@/lib/search-url";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/highlights">;

export const metadata: Metadata = { title: "My highlights", robots: { index: false } };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// About how many characters of a highlight's verses the list quotes.
const QUOTE_CHARS = 600;

const muted = "text-stone-600 dark:text-stone-400";
const link =
  "underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";
const control =
  "h-9 rounded-md border border-stone-300 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900";
const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const chipOff =
  "border-stone-300 bg-white hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800";
const chipOn =
  "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900";

// The translation a highlight is quoted in: the one it was made in while that
// is still loaded, otherwise the default.
function quotedIn(highlight: Item, translations: readonly Translation[]): Translation | undefined {
  const made = highlight.passages.find((passage) => passage.translationId)?.translationId;
  return translations.find((translation) => translation.id === made) ?? translations[0];
}

// Each run of verses on one line, cut to a preview.
function quote(runs: readonly (readonly { text: string }[])[]): string {
  const text = runs
    .filter((verses) => verses.length > 0)
    .map((verses) => verses.map((verse) => verse.text).join(" "))
    .join(" … ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= QUOTE_CHARS) return text;
  return `${text.slice(0, QUOTE_CHARS).replace(/\s+\S*$/, "")}…`;
}

// "My highlights": the owner's highlights, newest first, each with its
// reference, verses, color, note and date, narrowed by color, book and the
// days they were made. See src/lib/highlights-url.ts for the URLs.
export default async function HighlightsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseHighlightFilters({
    color: first(params.color),
    book: first(params.book),
    from: first(params.from),
    to: first(params.to),
    page: first(params.page),
  });
  const owner = await requireOwner(highlightsPath(filters));
  // One URL per list: the filter form submits its empty fields too.
  const asked = new URLSearchParams(
    Object.entries(params).flatMap(([name, value]) => {
      const single = first(value);
      return single === undefined ? [] : [[name, single]];
    }),
  ).toString();
  if (asked !== (highlightsPath(filters).split("?")[1] ?? "")) redirect(highlightsPath(filters));
  const { color, book, from, to, page = 1 } = filters;

  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const [translations, books, results] = await Promise.all([
    listTranslations(db, defaultId),
    itemBooks(db, owner.id, "highlight"),
    listItems(
      db,
      {
        ownerId: owner.id,
        kind: "highlight",
        color,
        ranges: book && [bookRange(book.number)],
        from,
        to,
        timeZone: serverTimeZone(),
      },
      { limit: HIGHLIGHTS_PAGE_SIZE, offset: (page - 1) * HIGHLIGHTS_PAGE_SIZE },
    ),
  ]);
  const pages = Math.ceil(results.total / HIGHLIGHTS_PAGE_SIZE);
  // A page past the end, as after deleting the last highlight on it.
  if (results.total > 0 && page > pages) redirect(highlightsPath({ ...filters, page: pages }));

  // The verses of every highlight on the page, one query per translation.
  const quoted = results.items.map((highlight) => quotedIn(highlight, translations));
  const texts = new Map<string, string>();
  for (const translation of new Set(quoted)) {
    if (!translation) continue;
    const mine = results.items.filter((_, i) => quoted[i] === translation);
    const passages =
      (
        await getPassages(
          db,
          [translation.id],
          mine.flatMap((highlight) => highlight.passages),
        )
      ).get(translation.id) ?? [];
    let at = 0;
    for (const highlight of mine) {
      texts.set(highlight.id, quote(passages.slice(at, at + highlight.passages.length)));
      at += highlight.passages.length;
    }
  }
  const attributed = translations.filter((translation) =>
    quoted.some((used, i) => used === translation && texts.get(results.items[i].id)),
  );

  const filtered = hasFilters(filters);
  // The book the list is narrowed to stays in the menu when nothing is on it.
  const bookNumbers = [...new Set([...books, ...(book ? [book.number] : [])])].sort(
    (a, b) => a - b,
  );
  const firstShown = (page - 1) * HIGHLIGHTS_PAGE_SIZE + 1;
  const count = `${results.total.toLocaleString("en")} ${results.total === 1 ? "highlight" : "highlights"}`;

  return (
    <ReaderShell form={{}}>
      <div className="mt-10">
        <h1 className="font-serif text-4xl tracking-tight">My highlights</h1>
        <p className={`mt-2 text-sm ${muted}`}>
          Only you can see these. Select verses in the reader to highlight them.
        </p>

        <div className="mt-6 space-y-3 font-sans">
          <nav aria-label="Filter by color">
            <ul className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link
                  href={highlightsPath({ ...filters, color: undefined, page: 1 })}
                  aria-current={color ? undefined : "true"}
                  className={`${chip} ${color ? chipOff : chipOn}`}
                >
                  All colors
                </Link>
              </li>
              {HIGHLIGHT_COLORS.map((choice) => (
                <li key={choice.id} data-highlight={choice.id}>
                  <Link
                    href={highlightsPath({ ...filters, color: choice.id, page: 1 })}
                    aria-current={color === choice.id ? "true" : undefined}
                    className={`${chip} ${color === choice.id ? chipOn : chipOff}`}
                  >
                    <span aria-hidden="true" className="highlight-swatch" />
                    {choice.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form
            action="/highlights"
            method="get"
            aria-label="Filter by book and date"
            className="flex flex-wrap items-end gap-x-4 gap-y-3"
          >
            {color && <input type="hidden" name="color" value={color} />}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Book
              <select name="book" defaultValue={book ? bookSlug(book) : ""} className={control}>
                <option value="">All books</option>
                {bookNumbers.map((number) => {
                  const option = bookByNumber(number)!;
                  return (
                    <option key={number} value={bookSlug(option)}>
                      {option.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              From
              <input type="date" name="from" defaultValue={from ?? ""} className={control} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              To
              <input type="date" name="to" defaultValue={to ?? ""} className={control} />
            </label>
            <button
              type="submit"
              className={`${control} cursor-pointer px-3 font-medium hover:bg-stone-100 dark:hover:bg-stone-800`}
            >
              Apply
            </button>
            {filtered && (
              <Link href={highlightsPath()} className={`pb-1.5 text-sm ${muted} ${link}`}>
                Clear filters
              </Link>
            )}
          </form>
        </div>

        <p role="status" data-highlights-status className={`mt-6 text-sm ${muted}`}>
          {results.total === 0
            ? filtered
              ? "No highlights match these filters."
              : "No highlights yet."
            : pages > 1
              ? `${count}. Showing ${firstShown}–${firstShown + results.items.length - 1}.`
              : `${count}.`}
        </p>

        {results.items.length > 0 && (
          <ol aria-label="Highlights" className="mt-4 space-y-4">
            {results.items.map((highlight, i) => {
              const translation = quoted[i];
              const text = texts.get(highlight.id);
              return (
                <li key={highlight.id}>
                  <HighlightCard
                    highlight={highlight}
                    href={readerPath(
                      highlight.passages,
                      translation && translationParam([translation.id], defaultId),
                    )}
                  >
                    <blockquote
                      data-highlight-quote
                      className="mt-2 font-serif text-lg leading-8 text-stone-900 dark:text-stone-100"
                    >
                      {text ? (
                        <>
                          <span className="highlight-text">{text}</span>{" "}
                          <span className={`font-sans text-xs ${muted}`}>{translation?.abbrev}</span>
                        </>
                      ) : (
                        <span className={`font-sans text-sm italic ${muted}`}>
                          {translation
                            ? `Not in the ${translation.abbrev} as loaded here.`
                            : "No translations are loaded."}
                        </span>
                      )}
                    </blockquote>
                  </HighlightCard>
                </li>
              );
            })}
          </ol>
        )}

        {pages > 1 && (
          <nav
            aria-label="Pages of highlights"
            className="mt-8 flex items-center justify-between font-sans text-sm"
          >
            {page > 1 ? (
              <Link href={highlightsPath({ ...filters, page: page - 1 })} rel="prev" className={link}>
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className={muted}>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={highlightsPath({ ...filters, page: page + 1 })} rel="next" className={link}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}

        {attributed.length > 0 && (
          <div className="mt-8 space-y-2">
            {attributed.map((translation) => (
              <Attribution key={translation.id} translation={translation} />
            ))}
          </div>
        )}
      </div>
    </ReaderShell>
  );
}
