import { and, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { item, itemPassage, verse } from "@/db/schema";
import type { VerseRange } from "@/lib/bible/verse-id";

// Reading and writing items: the owner's highlights today, reflections and
// notes from M8 on. Every function here trusts its caller about who is
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
  markdown: string | null;
  note: string | null;
  color: string | null;
  visibility: ItemVisibility;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // In reading order.
  passages: ItemPassage[];
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
  passages: readonly VerseRange[];
  // The translation the passages were read in.
  translationId?: string | null;
  markdown?: string | null;
  note?: string | null;
  color?: string | null;
  // Private unless said otherwise.
  visibility?: ItemVisibility;
};

// Creates an item with its passages, as one unit. Returns its id.
export async function createItem(db: Db, input: NewItem): Promise<string> {
  const { passages, translationId = null, ...values } = input;
  return db.transaction(async (tx) => {
    const [{ id }] = await tx.insert(item).values(values).returning({ id: item.id });
    if (passages.length > 0) {
      await tx.insert(itemPassage).values(
        passages.map((range) => ({
          itemId: id,
          verseStart: range.start,
          verseEnd: range.end,
          translationId,
        })),
      );
    }
    return id;
  });
}

export type ItemChanges = Partial<
  Pick<Item, "markdown" | "note" | "color" | "visibility" | "publishedAt">
>;

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

// Deletes one of the owner's items and its passages. False when there is no
// such item.
export async function deleteItem(db: Db, ref: ItemRef): Promise<boolean> {
  const deleted = await db.delete(item).where(refers(ref)).returning({ id: item.id });
  return deleted.length > 0;
}

// Everything of an item but whose it is.
const itemColumns = {
  id: item.id,
  kind: item.kind,
  markdown: item.markdown,
  note: item.note,
  color: item.color,
  visibility: item.visibility,
  publishedAt: item.publishedAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
};

// The items with these ids, each with all of its passages, in the order of
// `ids`.
async function loadItems(db: Db, ids: readonly string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const [rows, passages] = await Promise.all([
    db.select(itemColumns).from(item).where(inArray(item.id, [...ids])),
    db
      .select()
      .from(itemPassage)
      .where(inArray(itemPassage.itemId, [...ids]))
      .orderBy(itemPassage.verseStart, itemPassage.verseEnd),
  ]);
  const byId = new Map(
    rows.map((row) => [row.id, { ...row, passages: [] as ItemPassage[] }]),
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

export type ItemFilter = {
  ownerId: string;
  kind?: ItemKind;
  color?: string;
  // Only items on verses that overlap these ranges: a passage, or a book
  // (bookRange() in src/lib/bible/verse-id.ts).
  ranges?: readonly VerseRange[];
  // Created on or after, and on or before, these days ("2026-10-13"), as the
  // calendar reads in `timeZone`.
  from?: string;
  to?: string;
  timeZone?: string;
};

function matches({ ownerId, kind, color, ranges, from, to, timeZone = "UTC" }: ItemFilter): SQL {
  const day = sql`(${item.createdAt} at time zone ${timeZone})::date`;
  return and(
    eq(item.ownerId, ownerId),
    kind && eq(item.kind, kind),
    color ? eq(item.color, color) : undefined,
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
