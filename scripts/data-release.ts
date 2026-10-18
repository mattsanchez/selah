import path from "node:path";

import { CACHE_DIR, describeOrigin, fetchPinnedFile } from "../src/lib/bible/import/download";
import { DATA_RELEASE } from "../src/lib/bible/import/mirror";
import { buildDataRelease } from "../src/lib/data-release/build";
import { pinnedFiles } from "../src/lib/data-release/catalog";
import { publishDataRelease } from "../src/lib/data-release/publish";
import { gh } from "./gh";

// Builds the data release named by DATA_RELEASE from the download cache and,
// with --publish, publishes it on GitHub. See "Data releases" in the README.
//
//   pnpm data:release             stage and verify; publishes nothing
//   pnpm data:release --publish   also publish, with the `gh` CLI
//
// Run by a maintainer on purpose, after a pin has changed and DATA_RELEASE
// names a new release. Nothing runs it automatically.

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--publish");
if (unknown.length > 0) {
  console.error(`Unknown argument: ${unknown.join(" ")}\nUsage: pnpm data:release [--publish]`);
  process.exit(1);
}

try {
  const entries = pinnedFiles();

  // Fill the cache: a file it already holds is not downloaded again. Each is
  // verified against its pin here, and again from the cache below.
  for (const { file } of entries) {
    if (!file.mirrored) continue;
    const origin = await fetchPinnedFile(file);
    console.log(`${file.name}: ${describeOrigin(origin)}, checksum ${file.pin.slice(0, 12)}… verified`);
  }

  const outDir = path.join(".cache", "data-release", DATA_RELEASE);
  const manifest = await buildDataRelease({ entries, cacheDir: CACHE_DIR, outDir, tag: DATA_RELEASE });

  console.log(`\n${DATA_RELEASE}, staged in ${outDir}:`);
  for (const file of manifest.files) {
    console.log(`  ${file.file.padEnd(46)} ${String(file.size).padStart(9)} bytes  ${file.license}`);
  }
  for (const { id, upstreamUrl } of manifest.upstreamOnly) {
    console.log(`  not mirrored (upstream only): ${id}, ${upstreamUrl}`);
  }

  if (args.includes("--publish")) {
    const { url } = await publishDataRelease({ entries, manifest, dir: outDir, gh });
    console.log(url);
  } else {
    console.log("\nNothing was published. Run `pnpm data:release --publish` to publish it.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
