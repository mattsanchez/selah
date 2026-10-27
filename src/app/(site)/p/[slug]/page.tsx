import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { FeedItem } from "@/components/items/feed-item";
import { Masthead } from "@/components/site/masthead";
import { getDb } from "@/db/client";
import { getOwner } from "@/lib/auth/owner";
import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference } from "@/lib/bible/reference";
import { editItemPath } from "@/lib/items-url";
import { entryDescription, publicEntries, resolvePermalink } from "@/lib/public-feed";
import { publicMetadata } from "@/lib/public-metadata";
import {
  decodeSegment,
  itemHeadline,
  itemKey,
  passagePath,
  permalinkPath,
  tagPath,
} from "@/lib/public-url";
import { readerPath } from "@/lib/reader-url";

type Props = PageProps<"/p/[slug]">;

// The item and how to print it, once per request for the page and its
// metadata. Undefined when there is no such item or the visitor may not see
// it: a private item is the owner's alone.
const load = cache(async (segment: string) => {
  const db = getDb();
  const owner = await getOwner().catch(() => null);
  const found = await resolvePermalink(db, decodeSegment(segment), { ownerId: owner?.id });
  if (!found) return undefined;
  const [entry] = await publicEntries(db, [found.item]);
  return { ...found, entry, owner };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load((await params).slug);
  if (!loaded) return { title: "Not found", robots: { index: false } };
  const { item } = loaded.entry;
  const headline = itemHeadline(item);
  return publicMetadata({
    title: headline,
    description: entryDescription(loaded.entry),
    path: permalinkPath(item),
    image: `/p/${itemKey(item.id)}/og.png`,
    imageAlt:
      item.kind === "highlight" && loaded.entry.passage
        ? `${loaded.entry.passage.reference}: ${entryDescription(loaded.entry)}`
        : headline,
    type: "article",
    publishedTime: item.publishedAt ?? undefined,
    modifiedTime: item.updatedAt,
    tags: item.tags.map((tag) => tag.name),
    noindex: item.visibility !== "public",
  });
}

const STATUS = {
  private: "Private: only you can see this.",
  unlisted: "Unlisted: anyone with the link can see this; it is not listed anywhere.",
  public: "Public.",
} as const;

const muted = "text-stone-600 dark:text-stone-400";
const link =
  "rounded-sm underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";

// One item on a page of its own, whatever its kind: a public or unlisted
// item for anyone, and a private one for the owner only (anyone else is
// told there is no such page). See src/lib/public-url.ts for the address.
export default async function PermalinkPage({ params }: Props) {
  const loaded = await load((await params).slug);
  if (!loaded) notFound();
  const { entry, owner, canonical } = loaded;
  const { item } = entry;
  if (!canonical) permanentRedirect(permalinkPath(item));
  const titled = item.kind === "reflection" && item.title;
  const passages = normalizeRanges(item.passages).slice(0, 6);

  return (
    <>
      <Masthead />
      <main className="site-main">
        <div className="site-permalink">
          {!titled && <h1 className="sr-only">{itemHeadline(item)}</h1>}
          <FeedItem
            entry={entry}
            headingLevel={1}
            tagHref={(slug) => tagPath(slug)}
            status={
              owner && (
                <>
                  <span aria-hidden="true">·</span>
                  <span data-visibility={item.visibility}>{STATUS[item.visibility]}</span>
                  <Link
                    href={
                      item.kind === "highlight"
                        ? readerPath(item.passages, undefined, { v: item.passages })
                        : editItemPath(item.id)
                    }
                    className={link}
                  >
                    Edit
                  </Link>
                </>
              )
            }
          />
        </div>

        {passages.length > 0 && (
          <nav aria-label="On the same passage" className={`site-column mt-12 font-sans text-sm ${muted}`}>
            <h2 className="site-footer-heading">On the same passage</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {passages.map((range) => (
                <li key={range.start}>
                  <Link href={passagePath([range])} className={link}>
                    Everything on {formatReference([range])}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </>
  );
}
