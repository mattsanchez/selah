import { runMigrations } from "../src/db/migrate";
import { countVerses, loadTranslation } from "../src/lib/bible/import/load";
import { fetchVerses, selectSources } from "./bible-sources";
import { connect } from "./db-connect";

// Loads the full text of every pinned translation (or those named as
// arguments) into Postgres. Safe to re-run.
const sources = selectSources(process.argv.slice(2));

const { db, client } = await connect();
try {
  await runMigrations(db);
  for (const source of sources) {
    const verses = await fetchVerses(source);
    await loadTranslation(db, source, verses, { prune: true });

    const headings = verses.reduce((n, v) => n + v.headings.length, 0);
    const footnotes = verses.reduce(
      (n, v) =>
        n +
        v.footnotes.length +
        v.headings.reduce((m, h) => m + (h.footnotes?.length ?? 0), 0),
      0,
    );
    const count = await countVerses(db, source.id);
    console.log(
      `${source.abbrev}: ${count} verses, ${headings} headings, ${footnotes} footnotes loaded`,
    );
  }
} finally {
  await client.end();
}
