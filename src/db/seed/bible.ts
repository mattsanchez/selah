import { readFixture } from "@/lib/bible/import/fixture";
import { countVerses, loadTranslation } from "@/lib/bible/import/load";
import { BIBLE_SOURCES } from "@/lib/bible/import/sources";

import type { SeedStep } from "./fixture";

// Loads John, Psalms and Romans of BSB, WEB and KJV. Upserts only, so it is a
// no-op on a database that already holds the fixture or a full import.
export const bibleFixtureStep: SeedStep = {
  name: "Bible fixture (John, Psalms, Romans in BSB, WEB, KJV)",
  run: async (db) => {
    for (const source of BIBLE_SOURCES) {
      const verses = await readFixture(source.id);
      await loadTranslation(db, source, verses);
      const count = await countVerses(db, source.id);
      if (count < verses.length) {
        throw new Error(
          `${source.abbrev}: expected at least ${verses.length} verses, found ${count}`,
        );
      }
    }
  },
};
