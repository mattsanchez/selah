import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MANIFEST_FILE,
  NOTICES_FILE,
  renderReleaseNotes,
  verifyPinnedFiles,
  type Manifest,
} from "./build";
import type { CatalogEntry } from "./catalog";

// Publishes a staged data release (see ./build.ts) as a GitHub release, with
// the `gh` CLI and whatever credentials it already has. A maintainer runs
// this on purpose: it refuses to run in CI, to publish a file that fails its
// pin, and to change a data release that is already published.

// Runs `gh` with these arguments.
export type Gh = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

type Env = Record<string, string | undefined>;

type ReleaseView = { isDraft: boolean; url: string; assets: { name: string; size: number }[] };

async function run(gh: Gh, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await gh(args);
  if (code !== 0) throw new Error(`gh ${args.join(" ")} failed:\n${stderr.trim() || stdout.trim()}`);
  return stdout;
}

async function view(gh: Gh, manifest: Manifest): Promise<ReleaseView | undefined> {
  const args = ["release", "view", manifest.release, "--repo", manifest.repository];
  const { code, stdout, stderr } = await gh([...args, "--json", "isDraft,url,assets"]);
  if (code === 0) return JSON.parse(stdout) as ReleaseView;
  if (/release not found/i.test(stderr)) return undefined;
  throw new Error(`gh ${args.join(" ")} failed:\n${stderr.trim()}`);
}

export async function publishDataRelease({
  entries,
  manifest,
  dir,
  gh,
  env = process.env,
  log = console.log,
}: {
  entries: readonly CatalogEntry[];
  manifest: Manifest;
  // The staged release: the mirrored files, the manifest and the notices.
  dir: string;
  gh: Gh;
  env?: Env;
  log?: (message: string) => void;
}): Promise<{ url: string; published: boolean }> {
  if (env.CI || env.GITHUB_ACTIONS) {
    throw new Error("A data release is published by a maintainer on purpose, never by CI.");
  }

  // Checked again here, on the very bytes about to be uploaded.
  const verified = await verifyPinnedFiles(entries, dir);
  for (const file of manifest.files) {
    const bytes = verified.get(file.file);
    const actual = bytes && createHash("sha256").update(bytes).digest("hex");
    if (actual !== file.sha256) {
      throw new Error(`${file.file} in ${dir} is not the file the manifest describes`);
    }
  }
  const expected = [...manifest.files.map((file) => file.file), MANIFEST_FILE, NOTICES_FILE].sort();
  const staged = (await readdir(dir)).sort();
  if (staged.join("\n") !== expected.join("\n")) {
    throw new Error(
      `${dir} must hold the pinned files, ${MANIFEST_FILE} and ${NOTICES_FILE} and nothing else. ` +
        `Expected: ${expected.join(", ")}. Found: ${staged.join(", ")}.`,
    );
  }
  const recorded = JSON.parse(await readFile(path.join(dir, MANIFEST_FILE), "utf8")) as Manifest;
  if (recorded.release !== manifest.release) {
    throw new Error(`${dir} holds ${recorded.release}, not ${manifest.release}`);
  }

  const { release: tag, repository } = manifest;
  const paths = (names: readonly string[]) => names.map((name) => path.join(dir, name));

  let existing = await view(gh, manifest);
  if (existing && !existing.isDraft) {
    // Versions of Selah look for their files under this tag, so a published
    // data release is never changed.
    const same = manifest.files.every((file) =>
      existing!.assets.some((asset) => asset.name === file.file && asset.size === file.size),
    );
    if (!same) {
      throw new Error(
        `${tag} is already published with different files, and a published data release is never changed. ` +
          "Name a new one in DATA_RELEASE (src/lib/bible/import/mirror.ts) and run this again.",
      );
    }
    log(`${tag} is already published with these files; nothing to do.`);
    return { url: existing.url, published: false };
  }

  if (!existing) {
    const notes = path.join(path.dirname(dir), `${tag}-notes.md`);
    await writeFile(notes, renderReleaseNotes(manifest) + "\n");
    log(`Creating ${tag} as a draft`);
    // A draft until every file is uploaded, and never the "latest" release:
    // that is the latest version of Selah. `--latest=false` alone is not
    // enough: while the repository has no other full release, GitHub shows
    // the newest one as latest whatever it was told. It never does that with
    // one marked as a pre-release, so a data release is marked as one.
    await run(gh, [
      "release", "create", tag, "--repo", repository, "--draft", "--prerelease", "--latest=false",
      "--title", `Data release ${tag} (pinned source files, not a version of Selah)`,
      "--notes-file", notes,
    ]);
    existing = { isDraft: true, url: "", assets: [] };
  } else {
    log(`Continuing the draft of ${tag}`);
  }

  // An earlier run may have been interrupted: upload only what is missing.
  const missing = expected.filter((name) => !existing!.assets.some((asset) => asset.name === name));
  if (missing.length > 0) {
    log(`Uploading ${missing.length} files`);
    await run(gh, ["release", "upload", tag, "--repo", repository, ...paths(missing)]);
  }

  const uploaded = await view(gh, manifest);
  const incomplete = manifest.files.filter(
    (file) => !uploaded?.assets.some((asset) => asset.name === file.file && asset.size === file.size),
  );
  if (!uploaded || incomplete.length > 0) {
    throw new Error(
      `The draft of ${tag} does not hold what was staged (${incomplete.map((file) => file.file).join(", ")}). ` +
        "It was left as a draft; delete the draft on GitHub and run this again.",
    );
  }

  await run(gh, [
    "release", "edit", tag, "--repo", repository, "--draft=false", "--prerelease", "--latest=false",
  ]);
  const published = await view(gh, manifest);
  log(`Published ${tag}`);
  return { url: published?.url ?? uploaded.url, published: true };
}
