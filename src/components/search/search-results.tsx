import Link from "next/link";

import { Attribution } from "@/components/passage/passage";
import type { Translation } from "@/lib/bible/passage";
import type { SearchHit, Segment } from "@/lib/bible/search";
import { formatReference } from "@/lib/bible/reference";
import { readerPath, translationParam } from "@/lib/reader-url";
import { verseRange } from "@/lib/search-url";

// Text with the words the search matched marked.
function Highlighted({ segments }: { segments: readonly Segment[] }) {
  return segments.map((segment, i) =>
    segment.match ? (
      <mark
        key={i}
        className="rounded-sm bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40"
      >
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  );
}

type SearchResultsProps = {
  hits: readonly SearchHit[];
  // Every translation a hit may be in.
  translations: readonly Translation[];
  defaultId: string;
};

// A page of search hits: for each, the reference (a link that opens the verse,
// or the whole passage, in the reader, in the translation it was found in),
// the translation, the text with matches marked, and any heading the search matched. Under the list, the attribution
// of each translation quoted.
export function SearchResults({ hits, translations, defaultId }: SearchResultsProps) {
  const byId = new Map(translations.map((translation) => [translation.id, translation]));
  const quoted = translations.filter((translation) =>
    hits.some((hit) => hit.translationId === translation.id),
  );

  return (
    <div className="space-y-8">
      <ol className="divide-y divide-stone-200 dark:divide-stone-800">
        {hits.map((hit) => {
          const translation = byId.get(hit.translationId);
          const verse = hit.endVerseId
            ? [{ start: hit.verseId, end: hit.endVerseId }]
            : verseRange(hit.verseId);
          return (
            <li
              key={`${hit.translationId}-${hit.verseId}`}
              data-result={hit.verseId}
              data-translation={hit.translationId}
              className="py-4 first:pt-0"
            >
              <h2 className="flex items-baseline gap-2 font-sans text-sm font-semibold">
                <Link
                  href={readerPath(verse, translationParam([hit.translationId], defaultId))}
                  className="rounded-sm text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400"
                >
                  {formatReference(verse)}
                  <span className="sr-only">, {translation?.name}</span>
                </Link>
                <span
                  aria-hidden
                  title={translation?.name}
                  className="text-xs font-medium tracking-wide text-stone-500 dark:text-stone-400"
                >
                  {translation?.abbrev ?? hit.translationId}
                </span>
              </h2>
              {hit.headings.map((heading, i) => (
                <p
                  key={i}
                  data-heading={heading.kind}
                  className="mt-1 text-sm text-stone-600 italic dark:text-stone-400"
                >
                  <Highlighted segments={heading.text} />
                </p>
              ))}
              <p className="mt-1 font-serif text-lg leading-8">
                <Highlighted segments={hit.text} />
              </p>
            </li>
          );
        })}
      </ol>
      <div className="space-y-2">
        {quoted.map((translation) => (
          <Attribution key={translation.id} translation={translation} />
        ))}
      </div>
    </div>
  );
}
