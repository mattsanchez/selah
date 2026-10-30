import postgres from "postgres";

import { loadEnv } from "../scripts/load-env";
import { createDb } from "../src/db/client";
import {
  createItem,
  setVisibility,
  type ItemVisibility,
  type NewItem,
} from "../src/lib/items/queries";
import { databaseUrl } from "../src/lib/env";
import { TEST_OWNER } from "../src/db/seed/test-owner";

// Direct access to the fixture database, for what a journey cannot reasonably
// do through the page: starting from no items, and making enough of them to
// fill more than one page of a list.

async function withDb<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  loadEnv();
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

// Deletes everything the test owner has made, so a run does not meet the
// highlights of the run before it.
export function clearTestOwnerItems(): Promise<void> {
  return withDb(async (sql) => {
    await sql`
      delete from item
      where owner_id in (select id from "user" where email = ${TEST_OWNER.email})`;
    await sql`
      delete from tag
      where owner_id in (select id from "user" where email = ${TEST_OWNER.email})`;
  });
}

// Deletes the test owner's items with a tag that starts with this: what a
// retried test left behind.
export function deleteItemsTagged(prefix: string): Promise<void> {
  return withDb(async (sql) => {
    await sql`
      delete from item where id in (
        select item_tag.item_id from item_tag join tag on tag.id = item_tag.tag_id
        where tag.slug like ${`${prefix}%`}
      )`;
    await sql`delete from tag where slug like ${`${prefix}%`}`;
  });
}

// Forgets Ask's saved answers and the day's count, so a run does not meet
// the run before it.
export function clearAsk(): Promise<void> {
  return withDb(async (sql) => {
    await sql`delete from ask_answer`;
    await sql`delete from ask_usage`;
  });
}

export type StoredItem = {
  kind: string;
  title: string | null;
  markdown: string | null;
  visibility: string;
  publishedAt: Date | null;
  // "start-end:translation", in reading order.
  passages: string[];
  // Slugs, in order.
  tags: string[];
};

// One of the test owner's items as the database has it: what a journey
// cannot see on a page that is the owner's alone.
export function storedItem(id: string): Promise<StoredItem | undefined> {
  return withDb(async (sql) => {
    const rows = await sql<StoredItem[]>`
      select kind, title, markdown, visibility, published_at as "publishedAt",
        array(
          select verse_start || '-' || verse_end || ':' || coalesce(translation_id, '')
          from item_passage where item_id = item.id order by verse_start, verse_end
        ) as passages,
        array(
          select tag.slug from item_tag join tag on tag.id = item_tag.tag_id
          where item_tag.item_id = item.id order by tag.slug
        ) as tags
      from item
      where id = ${id}
        and owner_id in (select id from "user" where email = ${TEST_OWNER.email})`;
    return rows[0];
  });
}

// Gives the test owner one highlight on each of these verses, the first one
// oldest.
export function seedHighlights(
  verseIds: readonly number[],
  { color, note }: { color: string; note: string },
): Promise<void> {
  return withDb(async (sql) => {
    const [{ id: ownerId }] = await sql`select id from "user" where email = ${TEST_OWNER.email}`;
    for (const [i, verseId] of verseIds.entries()) {
      const [{ id }] = await sql`
        insert into item (owner_id, kind, color, note, created_at)
        values (${ownerId}, 'highlight', ${color}, ${note},
                now() - make_interval(secs => ${verseIds.length - i}))
        returning id`;
      await sql`
        insert into item_passage (item_id, verse_start, verse_end, translation_id)
        values (${id}, ${verseId}, ${verseId}, 'bsb')`;
    }
  });
}

// Writes an item's Markdown as the M8 text area could have: what the editor
// cannot make, such as a card whose reference does not parse.
export function setItemMarkdown(id: string, markdown: string): Promise<void> {
  return withDb(async (sql) => {
    await sql`
      update item set markdown = ${markdown}, updated_at = now()
      where id = ${id}
        and owner_id in (select id from "user" where email = ${TEST_OWNER.email})`;
  });
}

export type OwnerItem = Omit<NewItem, "ownerId">;

// Makes one item for the test owner with the app's own functions, as the
// pages do: created private, then given its visibility the way "Share" and
// "Publish" give it (setVisibility). Returns its id. For journeys about what
// is done with items rather than how they are written.
export async function createOwnerItem(
  input: OwnerItem,
  visibility: ItemVisibility = "private",
): Promise<string> {
  loadEnv();
  const { db, client } = createDb(databaseUrl(), { max: 1 });
  try {
    const [owner] = await client<{ id: string }[]>`
      select id from "user" where email = ${TEST_OWNER.email}`;
    const id = await createItem(db, { ...input, ownerId: owner.id, visibility: "private" });
    if (visibility !== "private") await setVisibility(db, { ownerId: owner.id, id }, visibility);
    return id;
  } finally {
    await client.end();
  }
}
