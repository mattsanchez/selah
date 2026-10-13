import path from "node:path";

import type { Db } from "../src/db/client";
import { loadTranslation } from "../src/lib/bible/import/load";
import { BIBLE_SOURCES, type BibleSource } from "../src/lib/bible/import/sources";
import { dataDir } from "../src/lib/env";
import { describeImportFailure, withDownloadRetries } from "../src/lib/first-boot/imports";
import type { BootStep } from "../src/lib/first-boot/runner";
import { fetchVerses } from "./bible-sources";

// The steps of first boot, in the order they run. Migrations have already
// been applied when the first one starts. To add a step, append it to
// firstBootSteps below: give it a stable id, a title for the status page, a
// version that changes when what it loads changes, and an idempotent `run`.

function bibleStep(db: Db, source: BibleSource): BootStep {
  return {
    id: `bible:${source.id}`,
    title: `${source.name} (${source.abbrev})`,
    // The pins: a release that changes one loads that translation again.
    version: [source.contentSha256, source.formatting?.contentSha256 ?? ""].join(":"),
    run: async ({ log }) => {
      try {
        const verses = await withDownloadRetries(
          () =>
            fetchVerses(source, undefined, {
              cacheDir: path.join(dataDir(), "cache", "bible"),
              log,
            }),
          { log },
        );
        await loadTranslation(db, source, verses, { prune: true });
        log(`${source.abbrev}: ${verses.length} verses loaded`);
      } catch (error) {
        throw describeImportFailure(`The ${source.name}`, error);
      }
    },
  };
}

export function firstBootSteps(db: Db): BootStep[] {
  return [
    ...BIBLE_SOURCES.map((source) => bibleStep(db, source)),
    // Later imports (cross references, commentary) are appended here.
  ];
}
