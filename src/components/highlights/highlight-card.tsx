import Link from "next/link";
import type { ReactNode } from "react";

import { deleteHighlightAction } from "@/app/highlights/actions";
import { formatReference } from "@/lib/bible/reference";
import { highlightColor } from "@/lib/items/palette";
import type { Item } from "@/lib/items/queries";

import { HighlightForm } from "./highlight-form";

const VISIBILITY = { private: "Private", unlisted: "Unlisted", public: "Public" } as const;

// The time zone days are told in: the server's. Set TZ to change it.
export const serverTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

type HighlightCardProps = {
  highlight: Item;
  // Where its reference leads: the passage in the reader.
  href?: string;
  // The verses' text, where there is room for it.
  children?: ReactNode;
  headingLevel?: 3 | 4;
};

// One highlight, for its owner: the verses it is on, its color, note and
// date, and the form that changes or deletes it. The color accent is the
// card's `data-highlight` (see "Highlights" in globals.css).
export function HighlightCard({
  highlight,
  href,
  children,
  headingLevel = 3,
}: HighlightCardProps) {
  const Heading = `h${headingLevel}` as const;
  const reference = formatReference(highlight.passages);
  const color = highlightColor(highlight.color);
  return (
    <article
      data-highlight-item={highlight.id}
      data-highlight={color?.id}
      className="highlight-card"
    >
      <Heading className="font-sans text-base font-semibold">
        {href ? (
          <Link
            href={href}
            className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
          >
            {reference}
          </Link>
        ) : (
          reference
        )}
      </Heading>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-600 dark:text-stone-400">
        <span className="inline-flex items-center gap-1.5" data-highlight-color={color?.id}>
          <span aria-hidden="true" className="highlight-swatch" />
          {color?.name ?? "No color"}
        </span>
        <span aria-hidden="true">·</span>
        <span>{VISIBILITY[highlight.visibility]}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={highlight.createdAt.toISOString()}>
          {highlight.createdAt.toLocaleDateString("en", {
            dateStyle: "medium",
            timeZone: serverTimeZone(),
          })}
        </time>
      </p>

      {children}

      {highlight.note && (
        <p data-highlight-note-text className="mt-2 text-sm leading-6 text-stone-800 dark:text-stone-200">
          <span className="sr-only">Note: </span>
          {highlight.note}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2 text-sm">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline dark:text-stone-300 dark:hover:text-stone-100">
            Edit
          </summary>
          <div className="mt-3 space-y-3">
            <HighlightForm
              kind="edit"
              id={highlight.id}
              color={highlight.color}
              note={highlight.note}
            />
            <form action={deleteHighlightAction}>
              <input type="hidden" name="id" value={highlight.id} />
              <button
                type="submit"
                className="cursor-pointer text-sm text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-red-400"
              >
                Delete this highlight
              </button>
            </form>
          </div>
        </details>
        {/* M8: the "Share" action goes here, beside Edit. It publishes the
            highlight to the feed by changing its visibility and published_at. */}
      </div>
    </article>
  );
}
