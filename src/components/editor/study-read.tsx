"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Attribution, PassageQuote } from "@/components/passage/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { cutVerses, type PassageData } from "@/lib/editor/types";
import { readerPath, translationParam } from "@/lib/reader-url";
import { nextSelection, isSelected } from "@/lib/verse-selection";

import { fetchPassage, rememberPassage } from "./passages";
import type { StudyPanelProps } from "./study-sidebar";

const input =
  "h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900";
const quiet =
  "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// The verses of `ranges` among those read, as a card quotes them.
function cardFor(data: Extract<PassageData, { ok: true }>, ranges: VerseRange[], defaultId: string): PassageData {
  const all = data.verses.flat();
  const runs = ranges.map((range) => all.filter((verse) => verse.verseId >= range.start && verse.verseId <= range.end));
  const { verses, more } = cutVerses(runs);
  return {
    ok: true,
    reference: formatReference(ranges),
    ranges,
    translation: data.translation,
    verses,
    more,
    href: readerPath(ranges, translationParam([data.translation.id], defaultId)),
  };
}

// "Read": look a passage up, read it in any translation, select verses
// (click, Shift-click to extend, Ctrl/Cmd-click to add or remove one) and
// put them in the post where the cursor is.
export function ReadPanel({ bridge }: StudyPanelProps) {
  const { translationId, translations } = bridge;
  const [typed, setTyped] = useState(bridge.reading.query);
  const [shown, setShown] = useState<{ query: string; data?: PassageData }>({ query: "" });
  const [selection, setSelection] = useState<VerseRange[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  const look = async (query: string, select: VerseRange[] = []) => {
    if (!query.trim()) return;
    setLoading(true);
    const data = await fetchPassage(query, translationId, "reading");
    setLoading(false);
    setShown({ query, data });
    setTyped(data.ok ? data.reference : query);
    setSelection(select);
  };

  // Asked from elsewhere: the "/" menu, a search result.
  const asked = bridge.reading;
  const answered = useRef(0);
  useEffect(() => {
    if (asked.nonce === answered.current) return;
    answered.current = asked.nonce;
    // A request from outside the panel; `look` shows it is loading at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (asked.query) void look(asked.query, asked.select);
    if (asked.focus || !asked.query) box.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  // Another translation: the same passage in it.
  const readIn = useRef(translationId);
  useEffect(() => {
    if (readIn.current === translationId) return;
    readIn.current = translationId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (shown.query) void look(shown.query, selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void look(typed);
  };

  const data = shown.data;
  const passage = data?.ok ? data : undefined;
  const chosen = selection.length > 0 ? selection : passage?.ranges ?? [];
  const insertLabel = passage
    ? selection.length > 0
      ? `Insert ${formatReference(selection)}`
      : `Insert ${passage.reference}`
    : "Insert";

  const insert = () => {
    if (!passage) return;
    const card = cardFor(passage, chosen, translations[0]?.id ?? "");
    const reference = formatReference(chosen);
    rememberPassage(reference, passage.translation.abbrev, "card", card);
    bridge.insertPassage(reference, passage.translation.abbrev);
    setSelection([]);
  };

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} role="search" aria-label="Look up a passage" className="space-y-2 px-4 pt-4">
        <div className="flex gap-2">
          <input
            ref={box}
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="John 15, Ps 23, Rom 8:28-39"
            aria-label="Passage"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={data && !data.ok ? true : undefined}
            className={input}
          />
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Read
          </button>
        </div>
        {data && !data.ok && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {data.error}
          </p>
        )}
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4" aria-busy={loading || undefined}>
        {!passage ? (
          <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
            Type a reference to read it here. Select verses, then insert them where your cursor
            is.
          </p>
        ) : (
          <section aria-label={`Reading ${passage.reference}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-sans text-sm font-semibold">{passage.reference}</h3>
              <span className="text-xs text-stone-500 dark:text-stone-400">{passage.translation.abbrev}</span>
            </div>
            <div
              data-study-passage
              className="verse-select text-[0.95rem]"
              onClick={(event) => {
                const target = (event.target as HTMLElement).closest<HTMLElement>("[data-verse-id]");
                if (!target) return;
                const verseId = Number(target.dataset.verseId);
                const mode = event.shiftKey ? "extend" : event.metaKey || event.ctrlKey ? "toggle" : "replace";
                setSelection((current) => nextSelection(current, verseId, mode, passage.ranges));
              }}
            >
              <PassageQuote
                ranges={passage.verses}
                headings
                isSelected={(verseId) => isSelected(verseId, selection)}
              />
            </div>
            <div className="mt-4">
              <Attribution translation={passage.translation} />
            </div>
            <nav aria-label="Chapters" className="mt-4 flex items-center justify-between gap-2">
              {passage.previous ? (
                <button type="button" onClick={() => void look(passage.previous!.label)} className={quiet}>
                  ← {passage.previous.label}
                </button>
              ) : (
                <span />
              )}
              {passage.next && (
                <button type="button" onClick={() => void look(passage.next!.label)} className={quiet}>
                  {passage.next.label} →
                </button>
              )}
            </nav>
          </section>
        )}
      </div>

      {passage && bridge.passages && (
        <div className="border-t border-stone-200 bg-white/95 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/95">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={insert}
              className="h-9 min-w-0 flex-1 cursor-pointer truncate rounded-md bg-stone-900 px-3 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
            >
              {insertLabel}
            </button>
            {selection.length > 0 && (
              <button type="button" onClick={() => setSelection([])} className={quiet}>
                Clear
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
            Click a verse to select it; Shift-click to select through to another.
          </p>
        </div>
      )}
    </div>
  );
}
