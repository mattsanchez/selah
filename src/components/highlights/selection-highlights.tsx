import Link from "next/link";

import { formatReference, referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import type { Item } from "@/lib/items/queries";
import { readerPath } from "@/lib/reader-url";

import { HighlightCard } from "./highlight-card";
import { HighlightForm } from "./highlight-form";

type SelectionHighlightsProps = {
  // The page: the passage, its `t` parameter, the selection and whether a
  // click adds verses to it.
  ranges: readonly VerseRange[];
  t?: string;
  selection: readonly VerseRange[];
  add: boolean;
  // The translation the selection is being read in.
  translationId: string;
  // The owner's highlights on the selected verses, oldest first.
  highlights: readonly Item[];
};

const smallLink =
  "underline decoration-stone-300 underline-offset-2 hover:text-stone-900 dark:decoration-stone-600 dark:hover:text-stone-100";

// What the owner can do with the selected verses, at the top of the reader's
// panel: highlight them, and change or delete the highlights already on
// them. Rendered for the signed-in owner only.
export function SelectionHighlights({
  ranges,
  t,
  selection,
  add,
  translationId,
  highlights,
}: SelectionHighlightsProps) {
  const reference = formatReference(selection);
  return (
    <section data-study-section="highlight" aria-labelledby="study-highlight" className="mt-5">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {add ? (
          <>
            <span role="status" data-adding-verses>
              Click or tap verses to add or remove them.
            </span>{" "}
            <Link
              href={readerPath(ranges, t, { v: selection })}
              scroll={false}
              className={smallLink}
            >
              Done selecting
            </Link>
          </>
        ) : (
          <>
            <Link
              href={readerPath(ranges, t, { v: selection, add: true })}
              scroll={false}
              className={smallLink}
            >
              Select more verses
            </Link>
            , or Shift-click to select through to a verse.
          </>
        )}
      </p>

      <h3
        id="study-highlight"
        className="mt-6 mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
      >
        Highlight
      </h3>

      {highlights.length > 0 && (
        <ul aria-label={`Highlights on ${reference}`} className="mb-5 space-y-3">
          {highlights.map((highlight) => (
            <li key={highlight.id}>
              <HighlightCard highlight={highlight} headingLevel={4} />
            </li>
          ))}
        </ul>
      )}

      <div
        role="group"
        aria-label={
          highlights.length > 0 ? `Highlight ${reference} again` : `Highlight ${reference}`
        }
      >
        {highlights.length > 0 && (
          <h4 className="mb-2 text-sm font-semibold">Highlight {reference} again</h4>
        )}
        <HighlightForm
          kind="new"
          v={referenceSlug(selection)}
          p={referenceSlug(ranges)}
          t={t}
          translationId={translationId}
          firstVerse={selection[0].start}
        />
      </div>
    </section>
  );
}
