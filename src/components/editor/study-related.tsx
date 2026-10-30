"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Attribution } from "@/components/passage/passage";
import { chapterLabel } from "@/lib/bible/reference";
import { parseVerseId } from "@/lib/bible/verse-id";
import type { RelatedData } from "@/lib/editor/types";
import type { RelatedSource } from "@/lib/embeddings/related";
import { CROSS_REFERENCES } from "@/lib/study/sources";

import type { StudyPanelProps } from "./study-sidebar";

const quiet =
  "inline-flex h-7 cursor-pointer items-center rounded px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";

const SOURCE: Record<RelatedSource, string> = {
  meaning: "Close in meaning",
  "cross-reference": "Cross reference",
  keyword: "Shares its words",
};

// A list of related passages, each insertable or opened to read around. The
// list "Suggest related passages" can show too.
export function RelatedList({ data, bridge }: { data: RelatedData; bridge: StudyPanelProps["bridge"] }) {
  const { passages, translation } = data;
  const crossReferences = passages.some((passage) => passage.sources.includes("cross-reference"));
  return (
    <>
      <ol aria-label="Related passages" className="space-y-3">
        {passages.map((passage) => {
          const ref = parseVerseId(passage.start)!;
          return (
            <li key={passage.start} data-related={passage.reference} className="text-sm leading-6">
              <p className="font-sans text-xs font-semibold text-stone-900 dark:text-stone-100">{passage.reference}</p>
              <p className="text-[0.7rem] text-stone-500 dark:text-stone-400">
                {passage.sources.map((source) => SOURCE[source]).join(" · ")}
              </p>
              <p className="font-serif text-[0.95rem] text-stone-800 dark:text-stone-200">{passage.text}</p>
              <div className="mt-1 flex gap-1">
                {bridge.passages && (
                  <button
                    type="button"
                    onClick={() => bridge.insertPassage(passage.reference, translation.abbrev)}
                    aria-label={`Insert ${passage.reference}`}
                    className={quiet}
                  >
                    Insert
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => bridge.read(chapterLabel(ref.book, ref.chapter), [passage])}
                  aria-label={`Read ${passage.reference} in context`}
                  className={quiet}
                >
                  Read in context
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 space-y-1 text-xs text-stone-500 dark:text-stone-400">
        {crossReferences && <p>{CROSS_REFERENCES.attribution}.</p>}
        <Attribution translation={translation} />
      </div>
    </>
  );
}

// "Related": passages related to one in the post, or to any typed here. It
// opens on the last passage in the post.
export function RelatedPanel({ bridge, active }: StudyPanelProps) {
  const [reference, setReference] = useState("");
  const [data, setData] = useState<RelatedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inPost, setInPost] = useState<string[]>([]);
  const asked = useRef(0);

  const find = async (wanted: string) => {
    if (!wanted.trim()) return;
    const ask = ++asked.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/editor/related?${new URLSearchParams({ ref: wanted, t: bridge.translationId })}`,
      );
      const body = (await response.json()) as RelatedData | { error: string };
      if (ask !== asked.current) return;
      if ("error" in body) {
        setError(body.error);
        setData(null);
      } else {
        setError(null);
        setData(body);
      }
    } catch {
      if (ask === asked.current) setError("Related passages could not be loaded. Check the connection.");
    } finally {
      if (ask === asked.current) setLoading(false);
    }
  };

  const postPassages = bridge.postPassages;
  useEffect(() => {
    if (!active) return;
    const references = [...new Set(postPassages().map((passage) => passage.reference))];
    // The post changed under an open panel only by what is typed in it, so
    // this runs when the tab is opened; what was being read stays.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInPost(references);
    if (references.length > 0 && !reference) {
      const last = references.at(-1)!;
      setReference(last);
      void find(last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void find(reference);
  };

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} aria-label="Find related passages" className="px-4 pt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="A passage"
            aria-label="Related to"
            autoComplete="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Find
          </button>
        </div>
        {inPost.length > 1 && (
          <ul aria-label="Passages in this post" className="mt-2 flex flex-wrap gap-1">
            {inPost.map((each) => (
              <li key={each}>
                <button
                  type="button"
                  onClick={() => {
                    setReference(each);
                    void find(each);
                  }}
                  aria-pressed={each === reference}
                  className="cursor-pointer rounded-full border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100 aria-pressed:border-stone-900 dark:border-stone-700 dark:hover:bg-stone-800 dark:aria-pressed:border-stone-100"
                >
                  {each}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-busy={loading || undefined}>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Put a passage in the post, or type one here, to see what is related to it.
          </p>
        )}
        {data && data.passages.length === 0 && (
          <p role="status" className="text-sm text-stone-500 dark:text-stone-400">
            Nothing related to {data.reference} was found.
          </p>
        )}
        {data && data.passages.length > 0 && <RelatedList data={data} bridge={bridge} />}
      </div>
    </div>
  );
}
