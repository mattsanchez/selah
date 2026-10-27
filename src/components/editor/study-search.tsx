"use client";

import { useState, type FormEvent } from "react";

import { chapterLabel } from "@/lib/bible/reference";
import { parseVerseId } from "@/lib/bible/verse-id";
import type { SearchData } from "@/lib/editor/types";

import type { StudyPanelProps } from "./study-sidebar";

const quiet =
  "inline-flex h-7 cursor-pointer items-center rounded px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// "Search": keyword search of the Bible (searchVerses, in the translation the
// sidebar reads), each verse insertable as it is or opened to read around.
export function SearchPanel({ bridge }: StudyPanelProps) {
  const { translationId, translations } = bridge;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; data: SearchData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abbrev = translations.find((translation) => translation.id === translationId)?.abbrev ?? "";

  const search = async (text: string, offset = 0) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/editor/search?${new URLSearchParams({ q: text, t: translationId, offset: String(offset) })}`,
      );
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as SearchData;
      setResults((current) =>
        offset > 0 && current
          ? { query: text, data: { ...data, hits: [...current.data.hits, ...data.hits] } }
          : { query: text, data },
      );
    } catch {
      setError("The search did not go through. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(query);
  };

  const data = results?.data;
  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} role="search" aria-label="Search the Bible" className="px-4 pt-4">
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="living water, “good shepherd”"
            aria-label="Search words"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Search
          </button>
        </div>
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">In the {abbrev}.</p>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-busy={loading || undefined}>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {data && (
          <p role="status" className="mb-3 text-xs text-stone-500 dark:text-stone-400">
            {!data.searchable
              ? "Those words are too common to search for."
              : data.total === 0
                ? "No verses match."
                : `${data.total.toLocaleString("en")} ${data.total === 1 ? "verse" : "verses"}.`}
          </p>
        )}
        {data && data.hits.length > 0 && (
          <ol aria-label="Search results" className="space-y-3">
            {data.hits.map((hit) => {
              const ref = parseVerseId(hit.verseId)!;
              return (
                <li key={`${hit.translationId}-${hit.verseId}`} data-search-hit={hit.verseId} className="text-sm leading-6">
                  <p className="font-sans text-xs font-semibold text-stone-900 dark:text-stone-100">{hit.reference}</p>
                  <p className="font-serif text-[0.95rem] text-stone-800 dark:text-stone-200">
                    {hit.text.map((segment, i) =>
                      segment.match ? (
                        <mark key={i} className="rounded-sm bg-amber-100 px-0.5 text-inherit dark:bg-amber-900/60">
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={i}>{segment.text}</span>
                      ),
                    )}
                  </p>
                  <div className="mt-1 flex gap-1">
                    {bridge.passages && (
                      <button
                        type="button"
                        onClick={() => bridge.insertPassage(hit.reference, abbrev)}
                        aria-label={`Insert ${hit.reference}`}
                        className={quiet}
                      >
                        Insert
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        bridge.read(chapterLabel(ref.book, ref.chapter), [{ start: hit.verseId, end: hit.verseId }])
                      }
                      aria-label={`Read ${hit.reference} in context`}
                      className={quiet}
                    >
                      Read in context
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {data && results && data.hits.length < data.total && (
          <button
            type="button"
            onClick={() => void search(results.query, data.hits.length)}
            className="mt-4 h-8 w-full cursor-pointer rounded-md border border-stone-300 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"
          >
            More results
          </button>
        )}
      </div>
    </div>
  );
}
