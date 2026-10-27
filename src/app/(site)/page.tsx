import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Masthead } from "@/components/site/masthead";
import { PublicFeed } from "@/components/site/public-feed";
import { getDb } from "@/db/client";
import { getOwner } from "@/lib/auth/owner";
import { listPublicItems } from "@/lib/items/public";
import { SITE_DESCRIPTION, publicEntries } from "@/lib/public-feed";
import { publicMetadata } from "@/lib/public-metadata";
import { PUBLIC_PAGE_SIZE, homePath, parsePage } from "@/lib/public-url";
import { getSiteTitle } from "@/lib/site";

type Props = PageProps<"/">;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage(first((await searchParams).page));
  return publicMetadata({
    title: page > 1 ? `Page ${page}` : undefined,
    description: SITE_DESCRIPTION,
    path: homePath(page),
    image: "/og.png",
    imageAlt: await getSiteTitle(),
  });
}

// The front page: everything published, newest first, ten to a page. Only
// public items; unlisted and private ones are never listed (see
// src/lib/items/public.ts). The owner, signed in, also gets the way to write.
export default async function HomePage({ searchParams }: Props) {
  const page = parsePage(first((await searchParams).page));
  const db = getDb();
  const [owner, results] = await Promise.all([
    getOwner().catch(() => null),
    listPublicItems(db, {}, { limit: PUBLIC_PAGE_SIZE, offset: (page - 1) * PUBLIC_PAGE_SIZE }),
  ]);
  const pages = Math.ceil(results.total / PUBLIC_PAGE_SIZE);
  if (page > 1 && page > pages) redirect(homePath(pages));
  const entries = await publicEntries(db, results.items);

  return (
    <>
      <Masthead home />
      <main className="site-main">
        {owner && (
          <div className="site-column mb-10">
            <Link href="/write" className="site-new-post">
              New post
            </Link>
          </div>
        )}
        <PublicFeed
          entries={entries}
          label="Items"
          page={page}
          pages={pages}
          pageHref={homePath}
          empty={
            owner
              ? "Nothing is published yet. Share a highlight, post a note or publish a reflection, and it will be here."
              : "Nothing is published here yet."
          }
        />
      </main>
    </>
  );
}
