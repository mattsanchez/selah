import Link from "next/link";

import { PassageQuote } from "@/components/passage/passage";
import type { PassageCardView } from "@/lib/items/feed";

// A passage quoted in an item: the verses, their reference (a link to the
// passage in the reader) and the translation they are quoted in. The verses
// are laid out as the reader lays them out, with their paragraphs, lines of
// poetry and red letters (<PassageQuote>). `color` gives the text the color
// of the highlight the card is in.
//
// The translation's attribution is printed by what the card is in: <FeedItem>
// lists it once for all the cards of an item.
export function PassageCard({ card, color }: { card: PassageCardView; color?: string }) {
  const { translation, runs } = card;
  const mark = color ? { color, count: 1 } : undefined;
  return (
    <figure data-passage-card={card.reference} className="passage-card">
      <blockquote>
        {runs.length > 0 ? (
          <>
            <PassageQuote
              ranges={runs}
              verseNumbers={runs.flat().length > 1}
              highlight={mark && (() => mark)}
            />
            {card.more && (
              <p aria-hidden="true" className="passage-text">
                …
              </p>
            )}
          </>
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
