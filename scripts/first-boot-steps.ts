import path from "node:path";

import type { Db } from "../src/db/client";
import { loadTranslation } from "../src/lib/bible/import/load";
import { BIBLE_SOURCES, type BibleSource } from "../src/lib/bible/import/sources";
import { dataDir } from "../src/lib/env";
import { describeImportFailure, withDownloadRetries } from "../src/lib/first-boot/imports";
import type { BootStep } from "../src/lib/first-boot/runner";
import {
  countCommentary,
  countCrossReferences,
  loadCommentary,
  loadCrossReferences,
} from "../src/lib/study/import/load";
import {
  COMMENTARY_SOURCES,
  CROSS_REFERENCES,
  type CommentarySource,
} from "../src/lib/study/sources";
import { fetchVerses } from "./bible-sources";
import { fetchCommentaryRecords, fetchCrossReferenceRows } from "./study-sources";

// The steps of first boot, in the order they run. Migrations have already
// been applied when the first one starts. To add a step, append an
// importStep({ ... }) to firstBootSteps below: give it a stable id, a title
// for the status page, a version that changes when what it loads changes
// (its pinned checksums), and an idempotent `load`.

// A step that downloads pinned files and loads them. `load` does the work,
// downloading into `cacheDir` and reporting through `log`; this adds what
// every import needs: a failed download is tried again, and a failure is
// recorded as a message naming the source and saying how to retry.
function importStep(step: {
  id: string;
  title: string;
  version: string;
  // How failure messages name it, e.g. "The World English Bible".
  what: string;
  load: (context: { cacheDir: string; log: (message: string) => void }) => Promise<void>;
}): BootStep {
  const { id, title, version, what, load } = step;
  return {
    id,
    title,
    version,
    run: async ({ log }) => {
      try {
        await withDownloadRetries(() => load({ cacheDir: path.join(dataDir(), "cache"), log }), {
          log,
        });
      } catch (error) {
        throw describeImportFailure(what, error);
      }
    },
  };
}

function bibleStep(db: Db, source: BibleSource): BootStep {
  return importStep({
    id: `bible:${source.id}`,
    title: `${source.name} (${source.abbrev})`,
    // The pins: a release that changes one loads that translation again.
    version: [source.contentSha256, source.formatting?.contentSha256 ?? ""].join(":"),
    what: `The ${source.name}`,
    load: async ({ cacheDir, log }) => {
      const verses = await fetchVerses(source, undefined, {
        cacheDir: path.join(cacheDir, "bible"),
        log,
      });
      await loadTranslation(db, source, verses, { prune: true });
      log(`${source.abbrev}: ${verses.length} verses loaded`);
    },
  });
}

// OpenBible.info rebuilds its archive daily with its readers' latest votes, so
// this is the step most likely to stop matching its pin. It is on its own so
// that nothing else waits on it; the study panel then has no cross references.
function crossReferencesStep(db: Db): BootStep {
  return importStep({
    id: `study:${CROSS_REFERENCES.id}`,
    title: "Cross references (OpenBible.info)",
    version: CROSS_REFERENCES.contentSha256,
    what: "The cross references from OpenBible.info",
    load: async ({ cacheDir, log }) => {
      const rows = await fetchCrossReferenceRows({ cacheDir: path.join(cacheDir, "study"), log });
      await loadCrossReferences(db, rows, { replace: true });
      log(`${CROSS_REFERENCES.name}: ${await countCrossReferences(db)} cross references loaded`);
    },
  });
}

function commentaryStep(db: Db, source: CommentarySource): BootStep {
  return importStep({
    id: `study:${source.id}`,
    title: source.name,
    version: source.contentSha256,
    what: source.name,
    load: async ({ cacheDir, log }) => {
      const records = await fetchCommentaryRecords(source, {
        cacheDir: path.join(cacheDir, "study"),
        log,
      });
      await loadCommentary(db, source, records, { replace: true });
      log(`${source.name}: ${await countCommentary(db, source.id)} entries loaded`);
    },
  });
}

// Each step is independent: one that fails is recorded and the rest still
// run. The Bible translations come first because the reader needs them; the
// study sources follow, one step each.
export function firstBootSteps(db: Db): BootStep[] {
  return [
    ...BIBLE_SOURCES.map((source) => bibleStep(db, source)),
    crossReferencesStep(db),
    ...COMMENTARY_SOURCES.map((source) => commentaryStep(db, source)),
    // Later imports go here, one importStep({ ... }) each.
  ];
}
