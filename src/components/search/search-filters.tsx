"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { BOOKS } from "@/lib/bible/books";
import {
  TESTAMENT_NAMES,
  bookSlug,
  parseScope,
  scopeParam,
  searchPath,
  searchTranslationParam,
  testamentOf,
  type SearchScope,
  type Testament,
} from "@/lib/search-url";

type SearchFiltersProps = {
  q: string;
  // The translations that can be searched, default first.
  translations: readonly { id: string; abbrev: string; name: string }[];
  selected: readonly string[];
  defaultId: string;
  scope?: SearchScope;
};

const TESTAMENTS: readonly Testament[] = ["ot", "nt"];

const control =
  "h-9 rounded-md border border-stone-300 bg-white text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900";

// Narrows a search: which translations, and the whole Bible, a testament or
// one book. Each change is a navigation to the search's own URL, back on its
// first page. Without JavaScript it is a GET form with an Apply button.
export function SearchFilters({ q, translations, defaultId, ...current }: SearchFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The controls show a choice at once, while its results load.
  const [{ selected, scope }, show] = useOptimistic({
    selected: current.selected,
    scope: current.scope,
  });
  const ids = translations.map((translation) => translation.id);

  function go(change: { selected?: readonly string[]; scope?: SearchScope }) {
    const next = { selected, scope, ...change };
    // At least one translation.
    if (next.selected.length === 0) return;
    const path = searchPath({
      q,
      t: searchTranslationParam(next.selected, ids, defaultId),
      scope: next.scope,
    });
    startTransition(() => {
      show(next);
      router.push(path, { scroll: false });
    });
  }

  return (
    <form
      action="/search"
      method="get"
      aria-label="Narrow the search"
      aria-busy={pending || undefined}
      className="flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <input type="hidden" name="q" value={q} />

      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <legend className="float-left mr-3 text-sm font-medium">Translations</legend>
        {translations.map((translation) => {
          const checked = selected.includes(translation.id);
          return (
            <label
              key={translation.id}
              title={translation.name}
              className="inline-flex items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                name="t"
                value={translation.id}
                checked={checked}
                aria-label={translation.name}
                // The last one stays ticked.
                disabled={checked && selected.length === 1}
                onChange={(event) =>
                  go({
                    selected: event.target.checked
                      ? [...selected, translation.id]
                      : selected.filter((id) => id !== translation.id),
                  })
                }
                className="size-4 accent-stone-900 dark:accent-stone-100"
              />
              {translation.abbrev}
            </label>
          );
        })}
        {translations.length > 1 && selected.length < translations.length && (
          <button
            type="button"
            onClick={() => go({ selected: ids })}
            className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            Search all
          </button>
        )}
      </fieldset>

      <label className="inline-flex items-center gap-3 text-sm font-medium">
        Search in
        <select
          name="in"
          value={scopeParam(scope) ?? ""}
          onChange={(event) => go({ scope: parseScope(event.target.value) })}
          className={`${control} px-2 font-normal`}
        >
          <option value="">The whole Bible</option>
          {TESTAMENTS.map((testament) => (
            <option key={testament} value={testament}>
              {TESTAMENT_NAMES[testament]}
            </option>
          ))}
          {TESTAMENTS.map((testament) => (
            <optgroup key={testament} label={`${TESTAMENT_NAMES[testament]} books`}>
              {BOOKS.filter((book) => testamentOf(book) === testament).map((book) => (
                <option key={book.usfm} value={bookSlug(book)}>
                  {book.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <noscript>
        <button type="submit" className={`${control} px-3`}>
          Apply
        </button>
      </noscript>
    </form>
  );
}
