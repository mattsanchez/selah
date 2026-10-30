import Link from "next/link";
import type { ReactNode } from "react";

import { serverTimeZone } from "@/components/highlights/highlight-card";
import { Attribution } from "@/components/passage/passage";
import type { FeedEntry } from "@/lib/items/feed";
import { highlightColor } from "@/lib/items/palette";
import type { ItemKind } from "@/lib/items/queries";
import { shareAlikeNotice } from "@/lib/items/share-alike";

import { PassageCard } from "./passage-card";

const KIND: Record<ItemKind, string> = {
  highlight: "Highlight",
  reflection: "Reflection",
  note: "Note",
};

const noticeLink =
  "underline decoration-stone-300 underline-offset-2 hover:text-stone-700 dark:decoration-stone-600 dark:hover:text-stone-200";

type FeedItemProps = {
  // From loadFeedEntries() in src/lib/items/feed.ts.
  entry: FeedEntry;
  headingLevel?: 1 | 2 | 3;
  // The item's own page: its date and its title link there.
  href?: string;
  // Where a tag leads; tags are plain text without it.
  tagHref?: (slug: string) => string;
  // Printed beside the date: for its owner, the item's visibility.
  status?: ReactNode;
  // Printed at the foot: for its owner, what can be done with the item.
  children?: ReactNode;
};

// One item of the stream, whatever its kind:
//
// - a highlight: its passage card with the text in the highlight's color, the
//   color as the accent along the item's edge, and its note;
// - a note: the passage it is on, when it is on one, and its text;
// - a reflection: its title and its Markdown, with a card wherever it embeds
//   a passage.
//
// And for each: its date, its tags, and the attribution of every translation
// it quotes. It shows whatever it is given; who may see an item is for the
// page that lists it to decide.
export function FeedItem({
  entry,
  headingLevel = 2,
  href,
  tagHref,
  status,
  children,
}: FeedItemProps) {
  const { item, passage, blocks } = entry;
  const Heading = `h${headingLevel}` as const;
  const color = item.kind === "highlight" ? highlightColor(item.color) : undefined;
  const date = item.publishedAt ?? item.createdAt;
  const time = (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString("en", { dateStyle: "medium", timeZone: serverTimeZone() })}
    </time>
  );
  return (
    <article
      data-feed-item={item.id}
      data-kind={item.kind}
      data-highlight={color?.id}
      className="feed-item"
    >
      <p className="flex flex-wrap items-center gap-x-2 font-sans text-xs text-stone-600 dark:text-stone-400">
        <span className="font-semibold tracking-wide uppercase">{KIND[item.kind]}</span>
        <span aria-hidden="true">·</span>
        {href ? (
          <Link href={href} rel="bookmark" className="underline-offset-4 hover:underline">
            {time}
          </Link>
        ) : (
          time
        )}
        {status}
      </p>

      {item.title && (
        <Heading data-feed-title className="mt-2 font-serif text-2xl tracking-tight">
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </Heading>
      )}

      {passage && (
        <div className="mt-3">
          <PassageCard card={passage} color={color?.id} />
        </div>
      )}

      {item.kind === "highlight" && item.note && (
        <p data-feed-note className="mt-3 font-sans text-base leading-7 text-stone-800 dark:text-stone-200">
          {item.note}
        </p>
      )}

      {blocks.length > 0 && (
        <div data-feed-body className="mt-3 space-y-4">
          {blocks.map((block, i) =>
            block.type === "html" ? (
              <div key={i} className="item-prose" dangerouslySetInnerHTML={{ __html: block.html }} />
            ) : block.type === "card" ? (
              <PassageCard key={i} card={block.card} />
            ) : (
              <p
                key={i}
                data-bad-card
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-sans text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                <code>{block.source}</code> {block.error}
              </p>
            ),
          )}
        </div>
      )}

      {item.tags.length > 0 && (
        <ul aria-label="Tags" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-sans text-sm">
          {item.tags.map((tag) => (
            <li key={tag.slug} data-tag={tag.slug}>
              {tagHref ? (
                <Link
                  href={tagHref(tag.slug)}
                  className="text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100"
                >
                  #{tag.name}
                </Link>
              ) : (
                <span className="text-stone-600 dark:text-stone-400">#{tag.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {entry.translations.length > 0 && (
        <div className="mt-3 space-y-1">
          {entry.translations.map((translation) => (
            <Attribution key={translation.id} translation={translation} />
          ))}
        </div>
      )}

      {entry.shareAlike.length > 0 && (
        <div className="mt-3 space-y-1">
          {entry.shareAlike.map((source) => (
            <p
              key={source.id}
              data-share-alike={source.id}
              className="font-sans text-xs leading-5 text-stone-500 dark:text-stone-400"
            >
              {shareAlikeNotice(source)}{" "}
              <a href={source.licenseUrl} rel="license noreferrer" className={noticeLink}>
                License
              </a>{" "}
              <a href={source.sourceUrl} rel="noreferrer" className={noticeLink}>
                Source
              </a>
            </p>
          ))}
        </div>
      )}

      {children}
    </article>
  );
}
