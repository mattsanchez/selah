import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { Masthead } from "@/components/site/masthead";
import { PublicFeed } from "@/components/site/public-feed";
import { getDb } from "@/db/client";
import { listPublicItems, publicTag } from "@/lib/items/public";
import { tagSlug } from "@/lib/items/tags";
import { publicEntries } from "@/lib/public-feed";
import { publicMetadata } from "@/lib/public-metadata";
import { PUBLIC_PAGE_SIZE, decodeSegment, feedPath, parsePage, tagPath } from "@/lib/public-url";
import { getSiteTitle } from "@/lib/site";

type Props = PageProps<"/tag/[slug]">;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// The tag a slug names, while a public item has it.
const load = cache(async (segment: string) => {
  const typed = decodeSegment(segment);
  const slug = tagSlug(typed);
  const tag = slug ? await publicTag(getDb(), slug) : undefined;
  return tag && { tag, canonical: typed === tag.slug };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const loaded = await load((await params).slug);
  if (!loaded) return { title: "Not found", robots: { index: false } };
  const { tag } = loaded;
  const page = parsePage(first((await searchParams).page));
  return publicMetadata({
    title: page > 1 ? `#${tag.name} (page ${page})` : `#${tag.name}`,
    description: `Everything tagged #${tag.name} on ${await getSiteTitle()}.`,
    path: tagPath(tag.slug, page),
    image: `${tagPath(tag.slug)}/og.png`,
    imageAlt: `#${tag.name}`,
    feedOf: tagPath(tag.slug),
  });
}

// The public items with a tag, newest first. A tag no public item has is not
// found, so the names of private tags never show.
export default async function TagPage({ params, searchParams }: Props) {
  const loaded = await load((await params).slug);
  if (!loaded) notFound();
  const { tag } = loaded;
  const page = parsePage(first((await searchParams).page));
  if (!loaded.canonical) redirect(tagPath(tag.slug, page));

  const db = getDb();
  const results = await listPublicItems(
    db,
    { tag: tag.slug },
    { limit: PUBLIC_PAGE_SIZE, offset: (page - 1) * PUBLIC_PAGE_SIZE },
  );
  const pages = Math.ceil(results.total / PUBLIC_PAGE_SIZE);
  if (page > 1 && page > pages) redirect(tagPath(tag.slug, pages));
  const entries = await publicEntries(db, results.items);

  return (
    <>
      <Masthead />
      <main className="site-main">
        <header className="site-column site-page-header">
          <p className="site-kicker">Tag</p>
          <h1 className="site-page-title">#{tag.name}</h1>
          <p className="site-page-meta">
            {results.total.toLocaleString("en")} {results.total === 1 ? "item" : "items"} ·{" "}
            <a href={feedPath("rss", tagPath(tag.slug))}>RSS</a> ·{" "}
            <a href={feedPath("atom", tagPath(tag.slug))}>Atom</a>
          </p>
        </header>
        <PublicFeed
          entries={entries}
          label={`Items tagged ${tag.name}`}
          page={page}
          pages={pages}
          pageHref={(n) => tagPath(tag.slug, n)}
          empty="Nothing here."
        />
      </main>
    </>
  );
}
