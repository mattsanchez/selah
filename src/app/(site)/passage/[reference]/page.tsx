import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { Passage } from "@/components/passage/passage";
import { Masthead } from "@/components/site/masthead";
import { PublicFeed } from "@/components/site/public-feed";
import { getDb } from "@/db/client";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { countVerses } from "@/lib/bible/ranges";
import { formatReference, referenceSlug } from "@/lib/bible/reference";
import { listPublicItems } from "@/lib/items/public";
import { publicEntries } from "@/lib/public-feed";
import { publicMetadata } from "@/lib/public-metadata";
import {
  PUBLIC_PAGE_SIZE,
  decodeSegment,
  feedPath,
  parsePage,
  parsePassage,
  passagePath,
} from "@/lib/public-url";
import { readerPath } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/passage/[reference]">;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// A passage longer than this many verses (a book, several chapters, Psalm
// 119) is not printed on the page; the reader has it.
const MAX_PRINTED_VERSES = 80;

// The passage, and its text in the site's default translation.
const load = cache(async (segment: string) => {
  const typed = decodeSegment(segment);
  const ranges = parsePassage(typed);
  if (!ranges) return undefined;
  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const translation = (await listTranslations(db, defaultId))[0];
  const printed = countVerses(ranges) <= MAX_PRINTED_VERSES;
  const text =
    translation && printed
      ? ((await getPassages(db, [translation.id], ranges)).get(translation.id) ?? [])
      : [];
  return { ranges, translation, text, printed, canonical: typed === referenceSlug(ranges) };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const loaded = await load((await params).reference);
  if (!loaded) return { title: "Not found", robots: { index: false } };
  const reference = formatReference(loaded.ranges);
  const page = parsePage(first((await searchParams).page));
  const quote = loaded.text
    .flat()
    .map((verse) => verse.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return publicMetadata({
    title: page > 1 ? `${reference} (page ${page})` : reference,
    description: quote
      ? `${quote.length > 200 ? `${quote.slice(0, 200).replace(/\s+\S*$/, "")}…` : quote} Highlights, reflections and notes on ${reference}.`
      : `Highlights, reflections and notes on ${reference}.`,
    path: passagePath(loaded.ranges, page),
    image: `${passagePath(loaded.ranges)}/og.png`,
    imageAlt: reference,
    feedOf: passagePath(loaded.ranges),
  });
}

const link =
  "rounded-sm underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";

// A passage, and every public item on verses that overlap it: an item on
// Romans 8:28 is on /passage/romans-8, and so is one on Romans 7:24-8:2.
// The passage itself comes first, in the site's default translation, with
// the way into the reader. See src/lib/public-url.ts for the addresses.
export default async function PassagePage({ params, searchParams }: Props) {
  const loaded = await load((await params).reference);
  if (!loaded) notFound();
  const { ranges, translation, text, printed } = loaded;
  const page = parsePage(first((await searchParams).page));
  if (!loaded.canonical) redirect(passagePath(ranges, page));

  const db = getDb();
  const results = await listPublicItems(
    db,
    { ranges },
    { limit: PUBLIC_PAGE_SIZE, offset: (page - 1) * PUBLIC_PAGE_SIZE },
  );
  const pages = Math.ceil(results.total / PUBLIC_PAGE_SIZE);
  if (page > 1 && page > pages) redirect(passagePath(ranges, pages));
  const entries = await publicEntries(db, results.items);
  const reference = formatReference(ranges);
  const reader = readerPath(ranges);
  const hasText = text.some((run) => run.length > 0);

  return (
    <>
      <Masthead />
      <main className="site-main">
        <header className="site-column site-page-header">
          <p className="site-kicker">Passage</p>
          <h1 className="site-page-title">{reference}</h1>
          <p className="site-page-meta">
            <Link href={reader} className={link}>
              Read {reference} in the reader
            </Link>
            {page === 1 && (
              <>
                {" · "}
                <a href="#written" className={link}>
                  {results.total === 1 ? "1 item" : `${results.total.toLocaleString("en")} items`} written on it
                </a>
              </>
            )}
          </p>
        </header>

        {page === 1 && translation && (
          <section aria-label={`${reference} (${translation.abbrev})`} className="site-column site-scripture">
            {hasText ? (
              <Passage translation={translation} ranges={text} idPrefix="passage" />
            ) : (
              <p className="font-sans text-sm text-stone-600 dark:text-stone-400">
                {printed
                  ? `The ${translation.abbrev} as loaded here has no text for ${reference}.`
                  : `${reference} is too long to print here.`}{" "}
                <Link href={reader} className={link}>
                  Read it in the reader
                </Link>
                .
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="written" className="mt-14">
          <header className="site-column">
            <h2 id="written" className="site-section-title">
              Written on {reference}
            </h2>
            <p className="site-page-meta">
              {results.total.toLocaleString("en")} {results.total === 1 ? "item" : "items"} ·{" "}
              <a href={feedPath("rss", passagePath(ranges))}>RSS</a> ·{" "}
              <a href={feedPath("atom", passagePath(ranges))}>Atom</a>
            </p>
          </header>
          <PublicFeed
            entries={entries}
            label={`Items on ${reference}`}
            page={page}
            pages={pages}
            pageHref={(n) => passagePath(ranges, n)}
            empty={`Nothing is written on ${reference} yet.`}
          />
        </section>
      </main>
    </>
  );
}
