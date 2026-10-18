import { and, desc, eq, exists, inArray, notExists, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { item, itemPassage, itemTag, tag, verse } from "@/db/schema";
import type { VerseRange } from "@/lib/bible/verse-id";

import type { TagName } from "./tags";

// Reading and writing items: the owner's highlights, reflections and notes,
// with their passages and their tags. Every function here trusts its caller about who is
// asking: the pages and server actions that call them get `ownerId` from
// getOwner() or requireOwner() (src/lib/auth/owner.ts) and from nowhere else.
//
// Nothing here is public yet. When the public site reads items (M9) it needs
// its own condition on `visibility`; do not reuse a query that takes an
// `ownerId` for a visitor.

export type ItemKind = (typeof item.kind.enumValues)[number];
export type ItemVisibility = (typeof item.visibility.enumValues)[number];

// One run of verses an item is on.
export type ItemPassage = VerseRange & { translationId: string | null };

export type Item = {
  id: string;
  kind: ItemKind;
  title: string | null;
  markdown: string | null;
  note: string | null;
  color: string | null;
  visibility: ItemVisibility;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // In reading order.
  passages: ItemPassage[];
  // By name.
  tags: TagName[];
};

// The overlap query: true for the `item_passage` rows whose range shares a
// verse with any of `ranges`. Written as the expression the GiST index
// item_passage_range_idx is on, so Postgres can use it.
export function overlapsPassage(ranges: readonly VerseRange[]): SQL {
  const conditions = ranges.map(
    (range) =>
      sql`int4range(${itemPassage.verseStart}, ${itemPassage.verseEnd}, '[]') && int4range(${range.start}::int, ${range.end}::int, '[]')`,
  );
  return conditions.length > 0 ? or(...conditions)! : sql`false`;
}

// True for the items with a passage that overlaps `ranges`.
function onPassage(ranges: readonly VerseRange[]): SQL {
  return exists(
    sql`(select 1 from ${itemPassage} where ${itemPassage.itemId} = ${item.id} and ${overlapsPassage(ranges)})`,
  );
}

export type NewItem = {
  ownerId: string;
  kind: ItemKind;
  // The verses it is on: normalized ranges (src/lib/bible/ranges.ts).
  passages: readonly (VerseRange & { translationId?: string | null })[];
  // The translation the passages were read in, for those that do not say.
  translationId?: string | null;
  title?: string | null;
  markdown?: string | null;
  note?: string | null;
  color?: string | null;
  // Private unless said otherwise; anything else is published as it is made.
  visibility?: ItemVisibility;
  tags?: readonly TagName[];
};

// The database's connection, or a transaction on it.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// `published_at` for an item given this visibility: none while it is private,
// otherwise the time it first stopped being private. The two columns are
// only ever written together (the table has a check on it).
export function publishedAtFor(visibility: ItemVisibility): SQL {
  return visibility === "private" ? sql`null` : sql`coalesce(${item.publishedAt}, now())`;
}

async function writePassages(tx: Tx, itemId: string, passages: readonly ItemPassage[]) {
  await tx.delete(itemPassage).where(eq(itemPassage.itemId, itemId));
  if (passages.length === 0) return;
  await tx.insert(itemPassage).values(
    passages.map((range) => ({
      itemId,
      verseStart: range.start,
      verseEnd: range.end,
      translationId: range.translationId,
    })),
  );
}

// Deletes the owner's tags that are on nothing.
async function dropUnusedTags(tx: Tx, ownerId: string) {
  await tx
    .delete(tag)
    .where(
      and(
        eq(tag.ownerId, ownerId),
        notExists(sql`(select 1 from ${itemTag} where ${itemTag.tagId} = ${tag.id})`),
      ),
    );
}

// Makes these the item's tags. A tag the owner already has (by its slug)
// keeps the name it has.
async function writeTags(tx: Tx, ownerId: string, itemId: string, tags: readonly TagName[]) {
  await tx.delete(itemTag).where(eq(itemTag.itemId, itemId));
  if (tags.length > 0) {
    await tx
      .insert(tag)
      .values(tags.map(({ slug, name }) => ({ ownerId, slug, name })))
      .onConflictDoNothing({ target: [tag.ownerId, tag.slug] });
    const rows = await tx
      .select({ id: tag.id })
      .from(tag)
      .where(
        and(
          eq(tag.ownerId, ownerId),
          inArray(
            tag.slug,
            tags.map(({ slug }) => slug),
          ),
        ),
      );
    await tx.insert(itemTag).values(rows.map((row) => ({ itemId, tagId: row.id })));
  }
  await dropUnusedTags(tx, ownerId);
}

// Creates an item with its passages and tags, as one unit. Returns its id.
export async function createItem(db: Db, input: NewItem): Promise<string> {
  const { passages, translationId = null, tags = [], visibility = "private", ...values } = input;
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(item)
      .values({ ...values, visibility, publishedAt: visibility === "private" ? null : sql`now()` })
      .returning({ id: item.id });
    await writePassages(
      tx,
      id,
      passages.map((range) => ({
        start: range.start,
        end: range.end,
        translationId: range.translationId ?? translationId,
      })),
    );
    if (tags.length > 0) await writeTags(tx, input.ownerId, id, tags);
    return id;
  });
}

// What updateItem changes. Visibility is setVisibility's.
export type ItemChanges = Partial<Pick<Item, "title" | "markdown" | "note" | "color">>;

// One of the owner's items, and optionally the kind it must be.
export type ItemRef = { ownerId: string; id: string; kind?: ItemKind };

const refers = ({ ownerId, id, kind }: ItemRef) =>
  and(eq(item.id, id), eq(item.ownerId, ownerId), kind && eq(item.kind, kind));

// Changes one of the owner's items. False when there is no such item.
export async function updateItem(db: Db, ref: ItemRef, changes: ItemChanges): Promise<boolean> {
  const updated = await db
    .update(item)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(refers(ref))
    .returning({ id: item.id });
  return updated.length > 0;
}

// Makes one of the owner's items private, unlisted or public, and keeps
// `published_at` in step: this is "Share", "Publish" and their opposites.
// False when there is no such item.
export async function setVisibility(
  db: Db,
  ref: ItemRef,
  visibility: ItemVisibility,
): Promise<boolean> {
  const updated = await db
    .update(item)
    .set({ visibility, publishedAt: publishedAtFor(visibility), updatedAt: sql`now()` })
    .where(refers(ref))
    .returning({ id: item.id });
  return updated.length > 0;
}

// What the editor saves, all of it at once.
export type ItemContent = {
  title: string | null;
  markdown: string;
  tags: readonly TagName[];
  // What `item_passage` is to hold; left as it is when undefined.
  passages?: readonly ItemPassage[];
};

// Saves the text of one of the owner's items with the passages and tags that
// go with it, as one unit. Returns when it was saved, or undefined when there
// is no such item.
export async function saveItemContent(
  db: Db,
  ref: ItemRef,
  { title, markdown, tags, passages }: ItemContent,
): Promise<Date | undefined> {
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(item)
      .set({ title, markdown, updatedAt: sql`now()` })
      .where(refers(ref))
      .returning({ updatedAt: item.updatedAt });
    if (!saved) return undefined;
    if (passages) await writePassages(tx, ref.id, passages);
    await writeTags(tx, ref.ownerId, ref.id, tags);
    return saved.updatedAt;
  });
}

// Deletes one of the owner's items with its passages, and the tags only it
// had. False when there is no such item.
export async function deleteItem(db: Db, ref: ItemRef): Promise<boolean> {
  return db.transaction(async (tx) => {
    const deleted = await tx.delete(item).where(refers(ref)).returning({ id: item.id });
    if (deleted.length > 0) await dropUnusedTags(tx, ref.ownerId);
    return deleted.length > 0;
  });
}

// Everything of an item but whose it is.
const itemColumns = {
  id: item.id,
  kind: item.kind,
  title: item.title,
  markdown: item.markdown,
  note: item.note,
  color: item.color,
  visibility: item.visibility,
  publishedAt: item.publishedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
};

// The tags of each of these items, by name.
export async function itemTags(db: Db, ids: readonly string[]): Promise<Map<string, TagName[]>> {
  const tags = new Map<string, TagName[]>();
  if (ids.length === 0) return tags;
  const rows = await db
    .select({ itemId: itemTag.itemId, slug: tag.slug, name: tag.name })
    .from(itemTag)
    .innerJoin(tag, eq(tag.id, itemTag.tagId))
    .where(inArray(itemTag.itemId, [...ids]))
    .orderBy(tag.name);
  for (const { itemId, ...row } of rows) {
    tags.set(itemId, [...(tags.get(itemId) ?? []), row]);
  }
  return tags;
}

// The items with these ids, each with all of its passages and tags, in the
// order of `ids`.
async function loadItems(db: Db, ids: readonly string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const [rows, passages, tags] = await Promise.all([
    db.select(itemColumns).from(item).where(inArray(item.id, [...ids])),
    db
      .select()
      .from(itemPassage)
      .where(inArray(itemPassage.itemId, [...ids]))
      .orderBy(itemPassage.verseStart, itemPassage.verseEnd),
    itemTags(db, ids),
  ]);
  const byId = new Map(
    rows.map((row) => [
      row.id,
      { ...row, passages: [] as ItemPassage[], tags: tags.get(row.id) ?? [] },
    ]),
  );
  for (const row of passages) {
    byId.get(row.itemId)?.passages.push({
      start: row.verseStart,
      end: row.verseEnd,
      translationId: row.translationId,
    });
  }
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// One of the owner's items, or undefined.
export async function getItem(db: Db, ref: ItemRef): Promise<Item | undefined> {
  const rows = await db.select({ id: item.id }).from(item).where(refers(ref)).limit(1);
  return (await loadItems(db, rows.map((row) => row.id)))[0];
}

// True for the items that have the owner's tag with this slug.
export function taggedWith(ownerId: string, slug: string): SQL {
  return exists(
    sql`(select 1 from ${itemTag} inner join ${tag} on ${tag.id} = ${itemTag.tagId} where ${itemTag.itemId} = ${item.id} and ${tag.ownerId} = ${ownerId} and ${tag.slug} = ${slug})`,
  );
}

// The owner's tags, by name, with how many items each is on.
export async function listTags(db: Db, ownerId: string): Promise<(TagName & { count: number })[]> {
  return db
    .select({ slug: tag.slug, name: tag.name, count: sql<number>`count(*)::int` })
    .from(tag)
    .innerJoin(itemTag, eq(itemTag.tagId, tag.id))
    .where(eq(tag.ownerId, ownerId))
    .groupBy(tag.id)
    .orderBy(tag.name);
}

export type ItemFilter = {
  ownerId: string;
  kind?: ItemKind;
  color?: string;
  // Only items with this tag: a slug (src/lib/items/tags.ts).
  tag?: string;
  // Only items on verses that overlap these ranges: a passage, or a book
  // (bookRange() in src/lib/bible/verse-id.ts).
  ranges?: readonly VerseRange[];
  // Created on or after, and on or before, these days ("2026-10-13"), as the
  // calendar reads in `timeZone`.
  from?: string;
  to?: string;
  timeZone?: string;
};

function matches({
  ownerId,
  kind,
  color,
  tag: slug,
  ranges,
  from,
  to,
  timeZone = "UTC",
}: ItemFilter): SQL {
  const day = sql`(${item.createdAt} at time zone ${timeZone})::date`;
  return and(
    eq(item.ownerId, ownerId),
    kind && eq(item.kind, kind),
    color ? eq(item.color, color) : undefined,
    slug ? taggedWith(ownerId, slug) : undefined,
    ranges && onPassage(ranges),
    from ? sql`${day} >= ${from}::date` : undefined,
    to ? sql`${day} <= ${to}::date` : undefined,
  )!;
}

// The owner's items on a passage, oldest first: everything with a passage
// that overlaps `ranges`. Each item comes with all of its passages, the ones
// outside `ranges` too.
export async function itemsOnPassage(
  db: Db,
  filter: ItemFilter & { ranges: readonly VerseRange[] },
): Promise<Item[]> {
  if (filter.ranges.length === 0) return [];
  const ids = await db
    .select({ id: item.id })
    .from(item)
    .where(matches(filter))
    .orderBy(item.createdAt, item.id);
  return loadItems(
    db,
    ids.map((row) => row.id),
  );
}

// A page of the owner's items, newest first, and how many match in all.
export async function listItems(
  db: Db,
  filter: ItemFilter,
  { limit, offset = 0 }: { limit: number; offset?: number },
): Promise<{ items: Item[]; total: number }> {
  const where = matches(filter);
  const [[{ total }], ids] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(item).where(where),
    db
      .select({ id: item.id })
      .from(item)
      .where(where)
      .orderBy(desc(item.createdAt), desc(item.id))
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

// The numbers of the books the owner's items of one kind are on, in canon
// order. A passage that runs from one book into the next counts for both
// (and for any between them).
export async function itemBooks(db: Db, ownerId: string, kind: ItemKind): Promise<number[]> {
  const rows = await db
    .selectDistinct({
      first: sql<number>`${itemPassage.verseStart} / 1000000`,
      last: sql<number>`${itemPassage.verseEnd} / 1000000`,
    })
    .from(itemPassage)
    .innerJoin(item, eq(item.id, itemPassage.itemId))
    .where(and(eq(item.ownerId, ownerId), eq(item.kind, kind)));
  const books = new Set<number>();
  for (const { first, last } of rows) {
    for (let book = first; book <= last; book++) books.add(book);
  }
  return [...books].sort((a, b) => a - b);
}

// Whether any loaded translation has a verse in these ranges. A highlight on
// verses nothing here prints could never be seen.
export async function hasVerses(db: Db, ranges: readonly VerseRange[]): Promise<boolean> {
  if (ranges.length === 0) return false;
  const rows = await db
    .select({ one: sql`1` })
    .from(verse)
    .where(
      or(...ranges.map((range) => sql`${verse.verseId} between ${range.start} and ${range.end}`)),
    )
    .limit(1);
  return rows.length > 0;
}
