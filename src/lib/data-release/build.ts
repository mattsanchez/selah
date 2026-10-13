import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { DATA_RELEASE_REPOSITORY, dataReleaseUrl } from "@/lib/bible/import/mirror";

import type { CatalogEntry } from "./catalog";

// Builds the files of a data release from the download cache: every pinned
// file exactly as it was downloaded, a manifest and the license notices.
// Nothing is staged unless every file is in the cache and matches its pin.

export const MANIFEST_FILE = "MANIFEST.json";
export const NOTICES_FILE = "NOTICES.md";

export type ManifestFile = {
  // The asset's name in the release; also its name in the download cache.
  file: string;
  id: string;
  title: string;
  format: CatalogEntry["format"];
  // Where the publisher serves it, and the publisher's page about it.
  upstreamUrl: string;
  sourcePage: string;
  // When this copy was downloaded (the cache file's date), ISO 8601.
  fetchedAt: string;
  // Of the file's raw bytes.
  size: number;
  sha256: string;
  // The pin this copy satisfies: a SHA-256 over what the import reads from
  // the file, computed by the function named in `by`.
  pin: { sha256: string; by: string };
  license: string;
  attribution: string;
};

export type Manifest = {
  // The version of this format.
  schema: 1;
  release: string;
  repository: string;
  // `${baseUrl}/${file}` downloads a file.
  baseUrl: string;
  createdAt: string;
  notices: typeof NOTICES_FILE;
  files: ManifestFile[];
  // Pinned files that are not in this release and come from upstream only.
  upstreamOnly: { id: string; upstreamUrl: string; pin: string }[];
};

// A file is missing from the cache or does not match its pin.
export class PinCheckError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      "Not publishing: every file of a data release must match its pin.\n" +
        problems.map((problem) => `- ${problem}`).join("\n"),
    );
    this.name = "PinCheckError";
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// The bytes of each mirrored file in `dir`, checked against its pin. Throws
// PinCheckError naming every file that is missing or fails.
export async function verifyPinnedFiles(
  entries: readonly CatalogEntry[],
  dir: string,
): Promise<Map<string, Uint8Array>> {
  const verified = new Map<string, Uint8Array>();
  const problems: string[] = [];
  for (const { file } of entries.filter((entry) => entry.file.mirrored)) {
    const bytes = await readFile(path.join(dir, file.name)).catch(() => undefined);
    if (!bytes) {
      problems.push(`${file.name} is not in ${dir}`);
      continue;
    }
    let actual: string | undefined;
    try {
      const content = file.read(bytes);
      actual = content === undefined ? undefined : file.checksum(content);
    } catch {
      actual = undefined;
    }
    if (actual === undefined) problems.push(`${file.name} is not ${file.expected}`);
    else if (actual !== file.pin) {
      problems.push(`${file.name} does not match its pin (pinned ${file.pin}, got ${actual})`);
    } else verified.set(file.name, bytes);
  }
  if (problems.length > 0) throw new PinCheckError(problems);
  return verified;
}

export function renderNotices(tag: string, entries: readonly CatalogEntry[]): string {
  const sections = entries
    .filter((entry) => entry.file.mirrored)
    .map((entry) =>
      [
        `## ${entry.file.name}`,
        `${entry.title}.`,
        `- License: ${entry.license}\n- Attribution: ${entry.attribution}\n` +
          `- Downloaded from: <${entry.file.upstreamUrl}>\n- Publisher's page: <${entry.sourcePage}>`,
        entry.notice,
      ].join("\n\n"),
    );
  return (
    [
      `# License notices for Selah data release ${tag}`,
      "These are the source files [Selah](https://github.com/" +
        `${DATA_RELEASE_REPOSITORY}) imports, each exactly as its publisher served it. ` +
        "Selah's MIT license does not cover them: each keeps its own terms, given below. " +
        `\`${MANIFEST_FILE}\` lists where and when each file was downloaded and its checksums.`,
      ...sections,
    ].join("\n\n") + "\n"
  );
}

// What the release page says. It must be plain that this is not a version of
// Selah.
export function renderReleaseNotes(manifest: Manifest): string {
  const megabytes = (size: number) => `${(size / 1e6).toFixed(1)} MB`;
  const rows = manifest.files.map(
    (file) => `| \`${file.file}\` | ${file.title} | ${megabytes(file.size)} | ${file.license} |`,
  );
  return [
    "**This is a data release, not a version of Selah.** There is nothing to install from here.",
    "It holds the source files Selah imports at first boot (Bible text, cross references, commentaries and study " +
      "notes), each exactly as downloaded from its publisher, in the copy Selah's checksums are pinned to. " +
      "The publishers' addresses are not versioned, so Selah downloads from this release first and from the " +
      "publisher second, and checks either copy against the same checksum.",
    "Versions of Selah look for these files under this tag, so this release and its files must not be edited or " +
      "deleted. A change to a pinned file is published as a new data release.",
    "| File | What | Size | License |\n| :--- | :--- | ---: | :--- |\n" + rows.join("\n"),
    `Every file is public domain or openly licensed. \`${NOTICES_FILE}\` has each license notice and attribution, and ` +
      `\`${MANIFEST_FILE}\` each file's upstream address, download date, size and checksums.`,
  ].join("\n\n");
}

// Stages the release in `outDir` (emptied first) and returns its manifest.
// Throws PinCheckError, staging nothing, unless every mirrored file is in
// `cacheDir` and matches its pin.
export async function buildDataRelease({
  entries,
  cacheDir,
  outDir,
  tag,
  now = new Date(),
}: {
  entries: readonly CatalogEntry[];
  cacheDir: string;
  outDir: string;
  tag: string;
  now?: Date;
}): Promise<Manifest> {
  if (!/^data-[a-z0-9][a-z0-9.-]*$/.test(tag)) {
    throw new Error(`A data release's tag starts with "data-", so it cannot be taken for a version of Selah: "${tag}"`);
  }
  const verified = await verifyPinnedFiles(entries, cacheDir);

  const files: ManifestFile[] = [];
  for (const entry of entries.filter((entry) => entry.file.mirrored)) {
    const bytes = verified.get(entry.file.name)!;
    const { mtime } = await stat(path.join(cacheDir, entry.file.name));
    files.push({
      file: entry.file.name,
      id: entry.id,
      title: entry.title,
      format: entry.format,
      upstreamUrl: entry.file.upstreamUrl,
      sourcePage: entry.sourcePage,
      fetchedAt: mtime.toISOString(),
      size: bytes.length,
      sha256: sha256(bytes),
      pin: { sha256: entry.file.pin, by: entry.pinnedBy },
      license: entry.license,
      attribution: entry.attribution,
    });
  }
  const manifest: Manifest = {
    schema: 1,
    release: tag,
    repository: DATA_RELEASE_REPOSITORY,
    baseUrl: dataReleaseUrl(tag),
    createdAt: now.toISOString(),
    notices: NOTICES_FILE,
    files,
    upstreamOnly: entries
      .filter((entry) => !entry.file.mirrored)
      .map(({ id, file }) => ({ id, upstreamUrl: file.upstreamUrl, pin: file.pin })),
  };

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const [name, bytes] of verified) await writeFile(path.join(outDir, name), bytes);
  await writeFile(path.join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(path.join(outDir, NOTICES_FILE), renderNotices(tag, entries));
  return manifest;
}
