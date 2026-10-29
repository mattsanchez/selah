import { and, asc, between, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { item, itemPassage, itemTag, tag } from "@/db/schema";
import type { VerseRange } from "@/lib/bible/verse-id";
import { keyIdRange } from "@/lib/public-url";

import { loadItems, overlapsPassage, type Item } from "./queries";
import type { TagName } from "./tags";

// Reading items for the public site: what a visitor, a feed reader or a
// crawler may see. The queries of ./queries.ts take an owner and return the
// owner's own items however visible they are; these take no owner and decide
// what is shown by `visibility` alone:
//
// - listed: `public` items, and only those. The feed, tag and passage pages,
//   the RSS and Atom feeds and the sitemap list nothing else.
// - reachable by its link: `public` and `unlisted` items. An unlisted item
//   has a permalink that works, and is listed nowhere.
// - private: no one's but the owner's. A permalink to one is not found
//   unless the owner is the one asking.
//
// `published_at` is set on every item that is not private (the check
// item_published_unless_private), so the listings order by it.

// What a listing is narrowed to.
export type PublicFilter = {
  // A tag's slug.
  tag?: string;
  // Verses: an item is on them when one of its passages overlaps one of them.
  ranges?: readonly VerseRange[];
};

// True for the items with a tag of this slug.
function hasTag(slug: string): SQL {
  return exists(
    sql`(select 1 from ${itemTag} inner join ${tag} on ${tag.id} = ${itemTag.tagId} where ${itemTag.itemId} = ${item.id} and ${tag.slug} = ${slug})`,
  );
}

// True for the items on verses that overlap `ranges`.
function onVerses(ranges: readonly VerseRange[]): SQL {
  return exists(
    sql`(select 1 from ${itemPassage} where ${itemPassage.itemId} = ${item.id} and ${overlapsPassage(ranges)})`,
  );
}

// The items a public listing may show: public ones, narrowed by `filter`.
export function listed({ tag: slug, ranges }: PublicFilter = {}): SQL {
  return and(
    eq(item.visibility, "public"),
    slug !== undefined ? hasTag(slug) : undefined,
    ranges !== undefined ? onVerses(ranges) : undefined,
  )!;
}

// The items a link may open: public and unlisted ones, and the owner's own
// private ones when the owner is asking.
export function reachable(ownerId?: string): SQL {
  const linked = inArray(item.visibility, ["public", "unlisted"]);
  return ownerId ? or(linked, eq(item.ownerId, ownerId))! : linked;
}

// A page of the public items, newest first, and how many there are in all.
export async function listPublicItems(
  db: Db,
  filter: PublicFilter,
  { limit, offset = 0 }: { limit: number; offset?: number },
): Promise<{ items: Item[]; total: number }> {
  if (filter.ranges?.length === 0) return { items: [], total: 0 };
  const where = listed(filter);
  const [[{ total }], ids] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(item).where(where),
    db
      .select({ id: item.id })
      .from(item)
      .where(where)
      .orderBy(desc(item.publishedAt), desc(item.id))
      .limit(limit)
      .offset(offset),
  ]);
  return {
    items: await loadItems(
      db,
      ids.map((row) => row.id),
    ),
    total,
  };
}

// The items a permalink's key may stand for, oldest first: almost always one,
// or none. Two items share a key only if the first 48 bits of their random
// ids are the same; the page tells them apart by their slugs.
export async function findByKey(
  db: Db,
  key: string,
  { ownerId }: { ownerId?: string } = {},
): Promise<Item[]> {
  const { from, to } = keyIdRange(key);
  const rows = await db
    .select({ id: item.id })
    .from(item)
    .where(and(between(item.id, from, to), reachable(ownerId)))
    .orderBy(asc(item.createdAt), asc(item.id))
    .limit(5);
  return loadItems(
    db,
    rows.map((row) => row.id),
  );
}

// The item with this id, while a link may open it: public or unlisted, or
// the owner's own when the owner is asking. For /items/<id>, the address a
// post links to another item by.
export async function findReachable(
  db: Db,
  id: string,
  { ownerId }: { ownerId?: string } = {},
): Promise<Item | undefined> {
  const rows = await db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.id, id), reachable(ownerId)))
    .limit(1);
  const [found] = await loadItems(
    db,
    rows.map((row) => row.id),
  );
  return found;
}

// The tag with this slug, while a public item has it. A tag on nothing but
// private and unlisted items is not shown anywhere, not even its name.
export async function publicTag(db: Db, slug: string): Promise<TagName | undefined> {
  const rows = await db
    .select({ slug: tag.slug, name: tag.name })
    .from(tag)
    .where(
      and(
        eq(tag.slug, slug),
        exists(
          sql`(select 1 from ${itemTag} inner join ${item} on ${item.id} = ${itemTag.itemId} where ${itemTag.tagId} = ${tag.id} and ${eq(item.visibility, "public")})`,
        ),
      ),
    )
    .orderBy(asc(tag.createdAt))
    .limit(1);
  return rows[0];
}

// Every tag a public item has, by name, with when its latest item was
// published: for the sitemap.
export async function publicTags(db: Db): Promise<(TagName & { latest: Date })[]> {
  const rows = await db
    .select({
      slug: tag.slug,
      name: sql<string>`min(${tag.name})`,
      latest: sql<string>`max(${item.publishedAt})`,
    })
    .from(tag)
    .innerJoin(itemTag, eq(itemTag.tagId, tag.id))
    .innerJoin(item, eq(item.id, itemTag.itemId))
    .where(eq(item.visibility, "public"))
    .groupBy(tag.slug)
    .orderBy(tag.slug);
  return rows.map((row) => ({ ...row, latest: new Date(row.latest) }));
}
