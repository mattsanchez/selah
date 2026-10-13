import { createHash } from "node:crypto";

import {
  fetchPinnedFile,
  type FetchOptions,
  type Origin,
  type PinnedFile,
} from "@/lib/bible/import/download";
import { pinnedFileName, type DownloadSource } from "@/lib/bible/import/mirror";
import { readZip } from "@/lib/bible/import/zip";

import type { CommentarySource, StudyDownload } from "../sources";
import type { CommentaryRecord, CrossRef } from "../types";
import { parseCrossReferences, type SkippedLine } from "./openbible";
import { normalizeSwordEntries, readSwordModule, type SwordEntry } from "./sword";
import { normalizeTyndaleItems, parseTyndaleItems, type TyndaleItem } from "./tyndale";

// Downloads the study sources (from Selah's mirror, then from the publisher),
// keeps them in the Bible import's cache and checks each against its pin. As
// there, a pin is a SHA-256 over what the import reads from a file rather
// than over its bytes: OpenBible.info rebuilds its archive daily with the date
// in the header line, and the commentaries' archives carry files the import
// does not read.

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
  // The copy that does not match the pin: the publisher's file, or the
  // mirror's copy of it.
  readonly url: string;

  constructor(
    source: StudyDownload,
    actual: string,
    served: DownloadSource = { url: source.downloadUrl, mirror: false },
  ) {
    super(
      `Checksum mismatch for ${source.name} (${served.url}).\n` +
        `  pinned: ${source.contentSha256}\n` +
        `  got:    ${actual}\n` +
        (served.mirror
          ? "The mirror's copy is not the file that was pinned."
          : "The upstream content has changed since it was pinned. Review the new file, " +
            "then update the pin in src/lib/study/sources.ts."),
    );
    this.name = "StudyChecksumError";
    this.url = served.url;
  }
}

export type { FetchOptions };

// A study source's pinned archive: `read` is what the import takes from its
// files, and `checksum` what the pin is over.
function archive<T>(
  source: StudyDownload,
  read: (files: Map<string, Uint8Array>) => T,
  checksum: (content: T) => string,
): PinnedFile<T> {
  return {
    name: pinnedFileName(source.id, source.contentSha256, "zip"),
    upstreamUrl: source.downloadUrl,
    pin: source.contentSha256,
    mirrored: !source.upstreamOnly,
    read: (bytes) => {
      try {
        return read(readZip(bytes));
      } catch {
        return undefined;
      }
    },
    checksum,
    expected: `the archive ${source.name} is published in`,
    mismatch: (actual, served) => new StudyChecksumError(source, actual, served),
  };
}

function textFile(files: Map<string, Uint8Array>, name: string): string {
  for (const [path, bytes] of files) {
    if (path === name || path.endsWith(`/${name}`)) return new TextDecoder().decode(bytes);
  }
  throw new Error(`${name} is missing`);
}

export function crossReferencesFile(source: StudyDownload) {
  return archive(
    source,
    (files) => parseCrossReferences(textFile(files, "cross_references.txt")),
    (parsed) => crossReferencesSha256(parsed.rows),
  );
}

const swordFile = (source: CommentarySource) => archive(source, readSwordModule, swordSha256);

const tyndaleFile = (source: CommentarySource) =>
  archive(
    source,
    (files) => {
      const items = parseTyndaleItems(textFile(files, "StudyNotes.xml"));
      if (items.length === 0) throw new Error("no study notes");
      return items;
    },
    tyndaleSha256,
  );

export function commentaryFile(source: CommentarySource): PinnedFile<unknown> {
  // A PinnedFile reads and checksums its own content, so the kind of content
  // does not matter to a caller that only verifies the file.
  return (source.format === "sword" ? swordFile(source) : tyndaleFile(source)) as PinnedFile<unknown>;
}

export async function fetchCrossReferences(
  source: StudyDownload,
  options?: FetchOptions,
): Promise<{ rows: CrossRef[]; skipped: SkippedLine[] } & Origin> {
  const { content, ...origin } = await fetchPinnedFile(crossReferencesFile(source), options);
  return { ...content, ...origin };
}

// A commentary's records, and the names of any notes left out because their
// passage is not in the canon.
export async function fetchCommentary(
  source: CommentarySource,
  options?: FetchOptions,
): Promise<{ records: CommentaryRecord[]; skipped: string[] } & Origin> {
  if (source.format === "sword") {
    const { content, ...origin } = await fetchPinnedFile(swordFile(source), options);
    return { records: normalizeSwordEntries(content, source), skipped: [], ...origin };
  }
  const { content, ...origin } = await fetchPinnedFile(tyndaleFile(source), options);
  return { ...normalizeTyndaleItems(content), ...origin };
}
