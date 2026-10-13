import { readCommentaryFixture, readCrossReferenceFixture } from "@/lib/study/import/fixture";
import {
  countCommentary,
  countCrossReferences,
  loadCommentary,
  loadCrossReferences,
} from "@/lib/study/import/load";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";

import type { SeedStep } from "./fixture";

// Loads the cross references from, and the commentary and study notes on,
// Psalm 23, John 3:16-21 and Romans 8:28-30. Upserts only, so it is a no-op
// on a database that already holds the fixture or a full import.
export const studyFixtureStep: SeedStep = {
  name: "Study fixture (cross references, commentary, study notes)",
  run: async (db) => {
    const rows = await readCrossReferenceFixture();
    await loadCrossReferences(db, rows);
    if ((await countCrossReferences(db)) < rows.length) {
      throw new Error(`Expected at least ${rows.length} cross references`);
    }
    for (const source of COMMENTARY_SOURCES) {
      const records = await readCommentaryFixture(source.id);
      await loadCommentary(db, source, records);
      const count = await countCommentary(db, source.id);
      if (count < records.length) {
        throw new Error(
          `${source.name}: expected at least ${records.length} entries, found ${count}`,
        );
      }
    }
  },
};
