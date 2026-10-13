import postgres from "postgres";

import { loadEnv } from "../scripts/load-env";
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
