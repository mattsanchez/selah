import Link from "next/link";
import type { ReactNode } from "react";

import { FeedItem } from "@/components/items/feed-item";
import type { FeedEntry } from "@/lib/items/feed";
import { permalinkPath, tagPath } from "@/lib/public-url";

const link =
  "rounded-sm underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";

type PublicFeedProps = {
  entries: readonly FeedEntry[];
  // What the list is called, for its accessible name.
  label: string;
  page: number;
  pages: number;
  // The path of another page of the same list.
  pageHref: (page: number) => string;
  // Said when there is nothing to list.
  empty: ReactNode;
};

// A page of public items, each linking to its permalink, and the way to the
// pages before and after: newer items first.
export function PublicFeed({ entries, label, page, pages, pageHref, empty }: PublicFeedProps) {
  if (entries.length === 0) {
    return <p className="site-empty">{empty}</p>;
  }
  return (
    <>
      <ol aria-label={label} className="site-feed">
        {entries.map((entry) => (
          <li key={entry.item.id}>
            <FeedItem entry={entry} href={permalinkPath(entry.item)} tagHref={(slug) => tagPath(slug)} />
          </li>
        ))}
      </ol>
      {pages > 1 && (
        <nav
          aria-label={`Pages of ${label.toLowerCase()}`}
          className="site-column mt-12 flex items-center justify-between font-sans text-sm text-stone-600 dark:text-stone-400"
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1)} rel="prev" className={link}>
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} rel="next" className={link}>
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
