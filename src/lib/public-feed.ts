import { getDb, type Db } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { loadFeedEntries, type FeedEntry } from "@/lib/items/feed";
import { cardText, entryHtml } from "@/lib/items/feed-html";
import { findByKey, listPublicItems, publicTag, type PublicFilter } from "@/lib/items/public";
import type { Item } from "@/lib/items/queries";
import { tagSlug } from "@/lib/items/tags";
import {
  decodeSegment,
  feedPath,
  itemHeadline,
  itemKey,
  itemSlug,
  itemSummary,
  parsePassage,
  parsePermalink,
  passagePath,
  permalinkPath,
  tagPath,
  type FeedFormat,
} from "@/lib/public-url";
import { getDefaultTranslationId, getSite, getSiteTitle } from "@/lib/site";
import { siteOrigin } from "@/lib/site-origin";
import type { OgCard } from "@/lib/og/image";
import { atomXml, rssXml, type Syndication } from "@/lib/syndication";

// What the public pages and the feeds share: items made ready to print, and
// the feeds themselves. Which items are shown is src/lib/items/public.ts's
// to decide; nothing here reads an item by any other way.

export const SITE_DESCRIPTION = "Highlights, reflections and notes from daily Bible reading.";

// How many items a feed carries: the latest.
export const FEED_SIZE = 20;

// The items as <FeedItem> prints them, quoting each card in its own
// translation or the site's default.
export async function publicEntries(db: Db, items: readonly Item[]): Promise<FeedEntry[]> {
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  return loadFeedEntries(db, items, { translations, defaultId });
}

// What a page or a card says an item is about, in a sentence or two: a
// highlight's verses (and its note), what a note or a reflection says.
export function entryDescription(entry: FeedEntry): string {
  const { item, passage } = entry;
  const summary = itemSummary(item);
  if (item.kind === "highlight" && passage) {
    const verses = `“${cardText(passage, 240)}” (${passage.reference}${passage.translation ? `, ${passage.translation.abbrev}` : ""})`;
    return summary ? `${verses} ${summary}` : verses;
  }
  return summary || (passage ? `On ${passage.reference}.` : "");
}

// What a feed is of: the whole site, a tag or a passage.
export type FeedScope =
  | { kind: "site" }
  | { kind: "tag"; slug: string; name: string; path: string }
  | { kind: "passage"; ranges: VerseRange[]; reference: string; path: string };

const scopeFilter = (scope: FeedScope): PublicFilter =>
  scope.kind === "tag"
    ? { tag: scope.slug }
    : scope.kind === "passage"
      ? { ranges: scope.ranges }
      : {};

const CONTENT_TYPE: Record<FeedFormat, string> = {
  rss: "application/rss+xml; charset=utf-8",
  atom: "application/atom+xml; charset=utf-8",
};

export async function feed(scope: FeedScope, format: FeedFormat): Promise<Response> {
  const db = getDb();
  const [origin, site, title] = await Promise.all([siteOrigin(), getSite(), getSiteTitle()]);
  const { items } = await listPublicItems(db, scopeFilter(scope), { limit: FEED_SIZE });
  const entries = await publicEntries(db, items);
  const path = scope.kind === "site" ? "/" : scope.path;
  const syndication: Syndication = {
    title:
      scope.kind === "tag"
        ? `#${scope.name} · ${title}`
        : scope.kind === "passage"
          ? `${scope.reference} · ${title}`
          : title,
    description:
      scope.kind === "tag"
        ? `Everything tagged #${scope.name} on ${title}.`
        : scope.kind === "passage"
          ? `Everything on ${scope.reference} on ${title}.`
          : SITE_DESCRIPTION,
    link: `${origin}${path}`,
    self: `${origin}${feedPath(format, path)}`,
    author: site?.handle ?? title,
    categoryScheme: `${origin}/tag/`,
    // When any of its entries last changed.
    updated:
      items.length > 0
        ? new Date(Math.max(...items.map((item) => item.updatedAt.getTime())))
        : new Date(),
    entries: entries.map((entry) => ({
      id: `${origin}/p/${itemKey(entry.item.id)}`,
      url: `${origin}${permalinkPath(entry.item)}`,
      title: itemHeadline(entry.item),
      html: entryHtml(entry, origin),
      published: entry.item.publishedAt ?? entry.item.createdAt,
      updated: entry.item.updatedAt,
      categories: entry.item.tags.map((tag) => ({ term: tag.slug, label: tag.name })),
    })),
  };
  return new Response(format === "rss" ? rssXml(syndication) : atomXml(syndication), {
    headers: { "content-type": CONTENT_TYPE[format] },
  });
}

// The item a permalink's path segment (decoded) opens, if anyone may: see
// findByKey(). `canonical` is false when the segment is not the item's
// current one, which the page then redirects to.
export async function resolvePermalink(
  db: Db,
  segment: string,
  { ownerId }: { ownerId?: string } = {},
): Promise<{ item: Item; canonical: boolean } | undefined> {
  const parsed = parsePermalink(segment);
  if (!parsed) return undefined;
  const candidates = await findByKey(db, parsed.key, { ownerId });
  const item = candidates.find((candidate) => itemSlug(candidate) === parsed.slug) ?? candidates[0];
  if (!item) return undefined;
  const slug = itemSlug(item);
  return { item, canonical: segment === (slug ? `${slug}-${parsed.key}` : parsed.key) };
}

// The scope of a tag's feed, while a public item has the tag.
export async function tagScope(segment: string): Promise<FeedScope | undefined> {
  const slug = tagSlug(decodeSegment(segment));
  const tag = slug ? await publicTag(getDb(), slug) : undefined;
  return tag && { kind: "tag", slug: tag.slug, name: tag.name, path: tagPath(tag.slug) };
}

// The scope of a passage's feed.
export function passageScope(segment: string): FeedScope | undefined {
  const ranges = parsePassage(decodeSegment(segment));
  return (
    ranges && {
      kind: "passage",
      ranges,
      reference: formatReference(ranges),
      path: passagePath(ranges),
    }
  );
}

// A feed's response, or Not Found when there is no such tag or passage.
export async function feedOrNotFound(
  scope: FeedScope | undefined,
  format: FeedFormat,
): Promise<Response> {
  return scope ? feed(scope, format) : new Response("Not found", { status: 404 });
}

// What an item's Open Graph image shows: a highlight, and a note on a
// passage, as the verses; a reflection, and a note on none, as its title and
// first words.
export function itemOgCard(entry: FeedEntry, site: string): OgCard {
  const { item, passage } = entry;
  const label = item.kind === "highlight" ? "Highlight" : item.kind === "note" ? "Note" : "Reflection";
  if (item.kind !== "reflection" && passage && passage.runs.length > 0) {
    return {
      kind: "verse",
      label,
      text: cardText(passage, 300),
      reference: passage.reference,
      translation: passage.translation?.abbrev,
      color: item.kind === "highlight" ? (item.color ?? undefined) : undefined,
      note: item.kind === "highlight" ? (item.note ?? undefined) : itemSummary(item, 110),
      site,
    };
  }
  const title = itemHeadline(item);
  const summary = itemSummary(item, 180);
  return {
    kind: "article",
    label,
    title,
    // An untitled item's headline is its first words already.
    excerpt: item.kind === "reflection" && item.title?.trim() ? summary : "",
    site,
  };
}

// How long a shared image may be kept: a while for anything public, which
// can still be edited or unpublished; not at all for a private item.
export const ogCacheControl = (visibility: Item["visibility"]) =>
  visibility === "private" ? "private, no-store" : "public, max-age=600";
