"use client";

import { useEffect, useRef, useState } from "react";

import { AskChat, Credit } from "@/components/ask/ask-chat";
import type { SourceQuote } from "@/lib/ask/quote";
import { formatReference, parseReference } from "@/lib/bible/reference";
import type { RelatedData } from "@/lib/editor/types";

import { RelatedList } from "./study-related";
import type { StudyPanelProps } from "./study-sidebar";

// "Ask": about the last passage in the post, or the one open in Read, or any
// typed here. What it finds goes into the post only by its own "Insert"
// button, one passage or one quote at a time. An answer's own words have no
// such button: the reflection is the writer's.

const quiet =
  "inline-flex h-7 cursor-pointer items-center rounded px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";
const action =
  "h-8 cursor-pointer rounded-md border border-stone-300 px-2.5 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 aria-pressed:border-stone-900 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800 dark:aria-pressed:border-stone-100";

type Shown =
  | { kind: "related"; data: RelatedData }
  | { kind: "commentators"; reference: string; cards: SourceQuote[] }
  | null;

export function AskPanel({ bridge, active }: StudyPanelProps) {
  const [typed, setTyped] = useState("");
  const [shown, setShown] = useState<Shown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const touched = useRef(false);

  const { postPassages, reading } = bridge;
  // What it opens on: until something is typed here, what the post is about.
  useEffect(() => {
    if (!active || touched.current) return;
    const scope = postPassages().at(-1)?.reference ?? reading.query;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (scope) setTyped(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reading.query]);

  const parsed = parseReference(typed.trim());
  const reference = parsed.ok ? formatReference(parsed.ranges) : undefined;

  const find = async <T,>(path: string, show: (body: T) => Shown) => {
    if (!reference) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${path}?${new URLSearchParams({ ref: reference, t: bridge.translationId })}`);
      const body = (await response.json()) as T & { error?: string };
      if (body.error) {
        setError(body.error);
        setShown(null);
      } else {
        setShown(show(body));
      }
    } catch {
      setError("That could not be loaded. Check the connection.");
    } finally {
      setLoading(false);
    }
  };

  const abbrev = bridge.translations.find((each) => each.id === bridge.translationId)?.abbrev ?? "";

  return (
    <div className="h-full overflow-y-auto px-4 py-4" aria-busy={loading || undefined}>
      <label className="block text-xs font-medium text-stone-600 dark:text-stone-300">
        Passage
        <input
          type="text"
          value={typed}
          onChange={(event) => {
            touched.current = true;
            setTyped(event.target.value);
            setShown(null);
          }}
          placeholder="Put a passage in the post, or type one"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      {reference ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={shown?.kind === "related"}
              onClick={() => void find<RelatedData>("/api/ask/suggest", (data) => ({ kind: "related", data }))}
              className={action}
            >
              Suggest related passages
            </button>
            <button
              type="button"
              aria-pressed={shown?.kind === "commentators"}
              onClick={() =>
                void find<{ reference: string; cards: SourceQuote[] }>("/api/ask/commentators", ({ reference: on, cards }) => ({
                  kind: "commentators",
                  reference: on,
                  cards,
                }))
              }
              className={action}
            >
              What do commentators say
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          {shown?.kind === "related" && (
            <div data-ask-suggestions className="mt-4 border-b border-stone-200 pb-4 dark:border-stone-800">
              {shown.data.passages.length > 0 ? (
                <RelatedList data={shown.data} bridge={bridge} />
              ) : (
                <p role="status" className="text-sm text-stone-500 dark:text-stone-400">
                  Nothing related to {shown.data.reference} was found.
                </p>
              )}
            </div>
          )}

          {shown?.kind === "commentators" && (
            <div data-ask-commentators className="mt-4 border-b border-stone-200 pb-4 dark:border-stone-800">
              {shown.cards.length > 0 ? (
                <ol aria-label="What commentators say" className="space-y-4">
                  {shown.cards.map((card) => (
                    <li key={card.sourceId} data-commentator={card.sourceId} className="text-sm leading-6">
                      <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">{card.label}</p>
                      <blockquote className="mt-0.5 font-serif text-[0.95rem] text-stone-800 dark:text-stone-200">{card.text}</blockquote>
                      <p data-quote-credit className="mt-0.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
                        <Credit quote={card} newTab />
                      </p>
                      <button type="button" onClick={() => bridge.insertQuote(card)} aria-label={`Insert the quote from ${card.label}`} className={`${quiet} mt-1`}>
                        Insert
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p role="status" className="text-sm text-stone-500 dark:text-stone-400">
                  No commentary on {shown.reference} here.
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <AskChat
              key={`${bridge.translationId}|${reference}`}
              reference={reference}
              translation={bridge.translationId}
              onInsertPassage={bridge.passages ? (passage) => bridge.insertPassage(passage, abbrev) : undefined}
              onInsertQuote={bridge.insertQuote}
            />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          {typed.trim() ? "That is not a passage this can read." : "Put a passage in the post, or type one here, to ask about it."}
        </p>
      )}
    </div>
  );
}
