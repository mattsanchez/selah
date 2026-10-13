import Link from "next/link";

import { parseVerseId } from "@/lib/bible/verse-id";
import type { PassageCardView } from "@/lib/items/feed";

// A passage quoted in an item: the verses, their reference (a link to the
// passage in the reader) and the translation they are quoted in. `highlighted`
// gives the text the color of the highlight the card is in (the
// `data-highlight` of an element around it).
//
// The translation's attribution is printed by what the card is in: <FeedItem>
// lists it once for all the cards of an item.
export function PassageCard({
  card,
  highlighted = false,
}: {
  card: PassageCardView;
  highlighted?: boolean;
}) {
  const { translation, runs } = card;
  const numbered = runs.flat().length > 1;
  return (
    <figure data-passage-card={card.reference} className="passage-card">
      <blockquote className="font-serif text-lg leading-8 text-stone-900 dark:text-stone-100">
        {runs.length > 0 ? (
          <span className={highlighted ? "highlight-text" : undefined}>
            {runs.map((verses, r) => (
              <span key={verses[0].verseId}>
                {r > 0 && " … "}
                {verses.map((verse, i) => (
                  <span key={verse.verseId} data-card-verse={verse.verseId}>
                    {i > 0 && " "}
                    {numbered && (
                      <sup className="mr-0.5 font-sans text-[0.65em] text-stone-500 dark:text-stone-400">
                        {parseVerseId(verse.verseId)?.verse}
                      </sup>
                    )}
                    {verse.text}
                  </span>
                ))}
              </span>
            ))}
            {card.more && " …"}
          </span>
        ) : (
          <span className="font-sans text-sm text-stone-600 italic dark:text-stone-400">
            {translation
              ? `Not in the ${translation.abbrev} as loaded here.`
              : "No translations are loaded."}
          </span>
        )}
      </blockquote>
      <figcaption className="mt-1.5 flex flex-wrap items-baseline gap-x-2 font-sans text-sm text-stone-600 dark:text-stone-400">
        <Link
          href={card.href}
          className="font-medium text-stone-900 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:text-stone-100"
        >
          {card.reference}
        </Link>
        {translation && <span data-card-translation={translation.id}>{translation.abbrev}</span>}
        {card.more && (
          <Link href={card.href} className="underline underline-offset-4">
            Read it all
          </Link>
        )}
      </figcaption>
    </figure>
  );
}
