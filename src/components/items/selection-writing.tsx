import Link from "next/link";

import { createReflectionAction } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { formatReference, referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { editItemPath } from "@/lib/items-url";
import { markdownExcerpt } from "@/lib/items/markdown";
import type { Item } from "@/lib/items/queries";

import { NoteForm } from "./note-form";

type SelectionWritingProps = {
  // The page and the selection, as <SelectionHighlights> has them.
  ranges: readonly VerseRange[];
  t?: string;
  selection: readonly VerseRange[];
  translationId: string;
  // The owner's reflections and notes on the selected verses, oldest first.
  written: readonly Item[];
};

const VISIBILITY = { private: "Private", unlisted: "Unlisted", public: "Public" } as const;

// Writing about the selected verses, in the reader's panel: "Reflect" starts
// a reflection with the passage embedded, "Note" posts a short item anchored
// to it, and what the owner has already written on these verses is listed.
// Rendered for the signed-in owner only.
export function SelectionWriting({
  ranges,
  t,
  selection,
  translationId,
  written,
}: SelectionWritingProps) {
  const reference = formatReference(selection);
  const v = referenceSlug(selection);
  return (
    <section data-study-section="write" aria-labelledby="study-write" className="mt-7">
      <h3
        id="study-write"
        className="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
      >
        Write
      </h3>

      <form action={createReflectionAction}>
        <input type="hidden" name="v" value={v} />
        <input type="hidden" name="translationId" value={translationId} />
        <Button type="submit" aria-label={`Reflect on ${reference}`}>
          Reflect
        </Button>
      </form>

      <details data-note-form className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline dark:text-stone-200">
          Note
        </summary>
        <div role="group" aria-label={`Note on ${reference}`} className="mt-3">
          <NoteForm anchor={{ v, p: referenceSlug(ranges), t, translationId }} />
        </div>
      </details>

      {written.length > 0 && (
        <ul aria-label={`Written on ${reference}`} className="mt-5 space-y-2">
          {written.map((item) => (
            <li key={item.id} data-written-item={item.id} className="text-sm leading-6">
              <Link
                href={editItemPath(item.id)}
                className="font-medium underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700 dark:decoration-stone-600"
              >
                {item.title ||
                  markdownExcerpt(item.markdown?.replace(/^\[\[.*\]\][ \t]*$/gm, "") ?? "", 80) ||
                  (item.kind === "reflection" ? "Untitled reflection" : "Note")}
              </Link>{" "}
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {item.kind === "reflection" ? "Reflection" : "Note"} · {VISIBILITY[item.visibility]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
