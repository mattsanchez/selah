import Link from "next/link";

import { createReflectionAction } from "@/app/items/actions";
import { Button } from "@/components/ui/button";
import { formatReference, referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { editItemPath, writePath } from "@/lib/items-url";
import { markdownExcerpt } from "@/lib/items/markdown";
import type { Item } from "@/lib/items/queries";
import { readerPath } from "@/lib/reader-url";

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
// a reflection with the passage embedded and opens it in the editor, "Note"
// opens the editor's note form on these verses (back here once posted), and
// what the owner has already written on these verses is listed.
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

      <div className="flex flex-wrap items-center gap-2">
        <form action={createReflectionAction}>
          <input type="hidden" name="v" value={v} />
          <input type="hidden" name="translationId" value={translationId} />
          <Button type="submit" aria-label={`Reflect on ${reference}`}>
            Reflect
          </Button>
        </form>
        <Link
          href={writePath({
            kind: "note",
            v,
            tr: translationId,
            back: readerPath(ranges, t, { v: selection }),
          })}
          aria-label={`Note on ${reference}`}
          className="inline-flex h-10 items-center rounded-md border border-stone-300 px-4 text-sm font-medium hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Note
        </Link>
      </div>

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
