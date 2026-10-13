import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixtureUrl, serializeFixture } from "../src/lib/bible/import/fixture";
import { FIXTURE_BOOKS } from "../src/lib/bible/import/sources";
import { fetchVerses, selectSources } from "./bible-sources";

// Rewrites the committed fixture (John, Psalms, Romans) from the pinned
// sources. Run it after changing a pin or the normalizer.
for (const source of selectSources(process.argv.slice(2))) {
  const verses = await fetchVerses(source, FIXTURE_BOOKS);
  const file = fileURLToPath(fixtureUrl(source.id));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    serializeFixture(
      source.id,
      source.contentSha256,
      verses,
      source.formatting?.contentSha256,
    ),
  );
  console.log(`${source.abbrev}: wrote ${verses.length} verses to ${path.relative(".", file)}`);
}
