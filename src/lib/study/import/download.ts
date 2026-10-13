import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_DIR, download } from "@/lib/bible/import/download";
import { readZip } from "@/lib/bible/import/zip";

import type { CommentarySource, StudyDownload } from "../sources";
import type { CommentaryRecord, CrossRef } from "../types";
import { parseCrossReferences, type SkippedLine } from "./openbible";
import { normalizeSwordEntries, readSwordModule, type SwordEntry } from "./sword";
import { normalizeTyndaleItems, parseTyndaleItems, type TyndaleItem } from "./tyndale";

// Downloads the study sources, keeps them in the Bible import's cache and
// checks each against its pin. As there, a pin is a SHA-256 over what the
// import reads from a file rather than over its bytes: OpenBible.info rebuilds
// its archive daily with the date in the header line, and the commentaries'
// archives carry files the import does not read.

const sha256 = (content: unknown) =>
  createHash("sha256").update(JSON.stringify(content)).digest("hex");

// Over every cross reference and its votes, in the file's order.
export function crossReferencesSha256(rows: readonly CrossRef[]): string {
  return sha256(rows.map((row) => [row.fromVerse, row.toStart, row.toEnd, row.votes]));
}

// Over every entry of a SWORD module: where it is and its markup.
export function swordSha256(entries: readonly SwordEntry[]): string {
  return sha256(
    entries.map((entry) => [entry.kind, entry.verseStart, entry.verseEnd, entry.osis]),
  );
}

// Over every study note: the passage it is on and its markup.
export function tyndaleSha256(items: readonly TyndaleItem[]): string {
  return sha256(items.map((item) => [item.name, item.refs, item.body]));
}

export class StudyChecksumError extends Error {
  // The file that no longer matches its pin.
  readonly url: string;

  constructor(source: StudyDownload, actual: string) {
    super(
      `Checksum mismatch for ${source.name} (${source.downloadUrl}).\n` +
        `  pinned: ${source.contentSha256}\n` +
        `  got:    ${actual}\n` +
        "The upstream content has changed since it was pinned. Review the new file, " +
        "then update the pin in src/lib/study/sources.ts.",
    );
    this.name = "StudyChecksumError";
    this.url = source.downloadUrl;
  }
}

export type FetchOptions = { cacheDir?: string; fetchImpl?: typeof fetch };

// Returns what `read` makes of the pinned archive, from the cache when it
// holds it. Throws StudyChecksumError rather than return content that does
// not match the pin.
async function fetchPinned<T>(
  source: StudyDownload,
  read: (files: Map<string, Uint8Array>) => T,
  checksum: (content: T) => string,
  { cacheDir = CACHE_DIR, fetchImpl = fetch }: FetchOptions = {},
): Promise<{ content: T; cached: boolean }> {
  const file = path.join(cacheDir, `${source.id}-${source.contentSha256.slice(0, 12)}.zip`);
  const parse = (bytes: Uint8Array): T | undefined => {
    try {
      return read(readZip(bytes));
    } catch {
      return undefined;
    }
  };

  const cached = await readFile(file).then(parse, () => undefined);
  if (cached !== undefined && checksum(cached) === source.contentSha256) {
    return { content: cached, cached: true };
  }

  // A DownloadError when the host is unreachable or answers with an error.
  const bytes = await download([source.downloadUrl], fetchImpl);
  const content = parse(bytes);
  if (content === undefined) {
    throw new Error(`${source.downloadUrl} is not the archive ${source.name} is published in`);
  }
  const actual = checksum(content);
  if (actual !== source.contentSha256) throw new StudyChecksumError(source, actual);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  return { content, cached: false };
}

function textFile(files: Map<string, Uint8Array>, name: string): string {
  for (const [path, bytes] of files) {
    if (path === name || path.endsWith(`/${name}`)) return new TextDecoder().decode(bytes);
  }
  throw new Error(`${name} is missing`);
}

export async function fetchCrossReferences(
  source: StudyDownload,
  options?: FetchOptions,
): Promise<{ rows: CrossRef[]; skipped: SkippedLine[]; cached: boolean }> {
  const { content, cached } = await fetchPinned(
    source,
    (files) => parseCrossReferences(textFile(files, "cross_references.txt")),
    (parsed) => crossReferencesSha256(parsed.rows),
    options,
  );
  return { ...content, cached };
}

// A commentary's records, and the names of any notes left out because their
// passage is not in the canon.
export async function fetchCommentary(
  source: CommentarySource,
  options?: FetchOptions,
): Promise<{ records: CommentaryRecord[]; skipped: string[]; cached: boolean }> {
  if (source.format === "sword") {
    const { content, cached } = await fetchPinned(source, readSwordModule, swordSha256, options);
    return { records: normalizeSwordEntries(content, source), skipped: [], cached };
  }
  const { content, cached } = await fetchPinned(
    source,
    (files) => {
      const items = parseTyndaleItems(textFile(files, "StudyNotes.xml"));
      if (items.length === 0) throw new Error("no study notes");
      return items;
    },
    tyndaleSha256,
    options,
  );
  return { ...normalizeTyndaleItems(content), cached };
}
