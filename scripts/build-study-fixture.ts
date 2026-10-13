import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fixtureCommentary,
  fixtureCrossReferences,
  serializeCommentary,
  serializeCrossReferences,
  studyFixtureUrl,
} from "../src/lib/study/import/fixture";
import { CROSS_REFERENCES, FIXTURE_PASSAGES } from "../src/lib/study/sources";
import {
  fetchCommentaryRecords,
  fetchCrossReferenceRows,
  selectStudySources,
} from "./study-sources";

// Rewrites the committed study fixture from the pinned sources. Run it after
// changing a pin, an importer or FIXTURE_PASSAGES.
async function write(name: string, content: string, count: number) {
  const file = fileURLToPath(studyFixtureUrl(name));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  console.log(
    `${name}: wrote ${count} rows (${(content.length / 1024).toFixed(0)} KB) to ${path.relative(".", file)}`,
  );
}

const selected = selectStudySources(process.argv.slice(2));
if (selected.crossReferences) {
  const rows = fixtureCrossReferences(await fetchCrossReferenceRows(), FIXTURE_PASSAGES);
  await write(
    CROSS_REFERENCES.id,
    serializeCrossReferences(CROSS_REFERENCES.contentSha256, rows),
    rows.length,
  );
}
for (const source of selected.commentaries) {
  const records = fixtureCommentary(await fetchCommentaryRecords(source), FIXTURE_PASSAGES);
  await write(
    source.id,
    serializeCommentary(source.id, source.contentSha256, records),
    records.length,
  );
}
