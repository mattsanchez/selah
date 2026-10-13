import { runMigrations } from "../src/db/migrate";
import {
  countCommentary,
  countCrossReferences,
  loadCommentary,
  loadCrossReferences,
} from "../src/lib/study/import/load";
import { CROSS_REFERENCES } from "../src/lib/study/sources";
import { connect } from "./db-connect";
import {
  fetchCommentaryRecords,
  fetchCrossReferenceRows,
  selectStudySources,
} from "./study-sources";

// Loads the whole of every pinned study source (or those named as arguments:
// cross-references, matthew-henry, jamieson-fausset-brown, adam-clarke,
// tyndale) into Postgres. Safe to re-run.
const selected = selectStudySources(process.argv.slice(2));

const { db, client } = await connect();
try {
  await runMigrations(db);
  if (selected.crossReferences) {
    const rows = await fetchCrossReferenceRows();
    await loadCrossReferences(db, rows, { replace: true });
    console.log(
      `${CROSS_REFERENCES.name}: ${await countCrossReferences(db)} cross references loaded`,
    );
  }
  for (const source of selected.commentaries) {
    const records = await fetchCommentaryRecords(source);
    await loadCommentary(db, source, records, { replace: true });
    const megabytes = records.reduce((n, record) => n + record.html.length, 0) / 1e6;
    console.log(
      `${source.name}: ${await countCommentary(db, source.id)} entries loaded (${megabytes.toFixed(1)} MB of HTML)`,
    );
  }
} finally {
  await client.end();
}
