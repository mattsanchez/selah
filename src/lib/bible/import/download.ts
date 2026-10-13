import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { bookByUsfm } from "../books";
import type { HelloaoTranslation } from "./helloao";
import {
  downloadSources,
  mirrorUrl,
  pinnedFileName,
  type DownloadSource,
} from "./mirror";
import type { BibleSource, FormattingSource } from "./sources";
import { parseUsfmBook, type UsfmBook } from "./usfm";
import { readZip } from "./zip";

// Downloads are kept here, outside git, and reused while they match the pin.
export const CACHE_DIR = ".cache/bible";

// The checksum a source is pinned to: SHA-256 over the Bible content of the
// file (every book's id and its chapters' numbers, content and footnotes) and
// nothing else. The API rebuilds its files to change metadata and audio links
// around the text, and its CDN can serve two builds at once, so a hash of the
// raw bytes would fail without a word of the text having changed.
export function contentSha256(translation: HelloaoTranslation): string {
  const content = translation.books.map((book) => [
    book.id,
    book.chapters.map(({ chapter }) => [
      chapter.number,
      chapter.content,
      chapter.footnotes,
    ]),
  ]);
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

// The checksum a formatting source is pinned to: SHA-256 over what the import
// reads from its USFM files, which is each verse's reference, its words, where
// its paragraphs start and which words are marked as the words of Jesus.
// eBible.org rebuilds its archive often, with a new date in the files around
// the text, and the files carry notes and Strong's numbers the import does
// not read, so a hash of the raw archive would fail for no reason.
export function formattingSha256(books: readonly UsfmBook[]): string {
  const content = [...books]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((book) => [
      book.id,
      book.verses.map((verse) => [
        verse.chapter,
        verse.verse,
        verse.text,
        verse.paragraphs,
        verse.wordsOfJesus.map((span) => [span.start, span.end]),
      ]),
    ]);
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export class ChecksumError extends Error {
  // The copy that does not match the pin: the publisher's file, or the
  // mirror's copy of it.
  readonly url: string;

  constructor(
    source: BibleSource,
    actual: string,
    // The pinned file: the source itself, or its formatting source.
    file: Pick<BibleSource, "downloadUrl" | "contentSha256"> = source,
    served: DownloadSource = { url: file.downloadUrl, mirror: false },
  ) {
    super(
      `Checksum mismatch for ${source.abbrev} (${served.url}).\n` +
        `  pinned: ${file.contentSha256}\n` +
        `  got:    ${actual}\n` +
        (served.mirror
          ? "The mirror's copy is not the file that was pinned."
          : "The upstream text has changed since it was pinned. Review the new file, " +
            "then update the pin in src/lib/bible/import/sources.ts."),
    );
    this.name = "ChecksumError";
    this.url = served.url;
  }
}

// The file could not be fetched: the host was unreachable or answered with an
// error. Unlike a ChecksumError, trying again later can succeed.
export class DownloadError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`Could not download ${url}: ${reason}`, options);
    this.name = "DownloadError";
  }
}

async function downloadFrom(url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    // Node's fetch says only "fetch failed"; the cause names the real problem.
    const cause = error instanceof Error ? error.cause : undefined;
    const detail =
      cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error);
    throw new DownloadError(url, `the host could not be reached: ${detail}`, { cause: error });
  }
  if (!response.ok) throw new DownloadError(url, `HTTP ${response.status}`);
  try {
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new DownloadError(url, "the download was cut short", { cause: error });
  }
}

// A pinned file: where it is downloaded from, what it must hash to, and how
// the import reads it. The Bible sources are described below; the study
// sources in src/lib/study/import/download.ts.
export type PinnedFile<T> = {
  // Its name in the download cache and in the mirror (see pinnedFileName).
  name: string;
  upstreamUrl: string;
  pin: string;
  // False for a file that is not in the mirror, which is then not asked.
  mirrored: boolean;
  // What the import reads from the file, or undefined when the bytes are not
  // this kind of file. May throw to say what is wrong with it.
  read(bytes: Uint8Array): T | undefined;
  // The checksum the pin is compared with, over what `read` returned.
  checksum(content: T): string;
  // Completes "<url> is not …" when `read` returns undefined.
  expected: string;
  mismatch(actual: string, served: DownloadSource): Error;
};

// A place a pinned file was asked for, and why its copy was not used.
export type SourceFailure = DownloadSource & { error: Error };

// Thrown when a file was asked for in more than one place and none gave a
// copy that matches the pin. With a single place, its own error is thrown.
export class SourcesFailedError extends Error {
  constructor(readonly failures: readonly SourceFailure[]) {
    super(failures.map(({ error }) => error.message).join("\n"));
    this.name = "SourcesFailedError";
  }
}

// Whether trying again later could succeed: true when some place could not
// be reached, false when every place answered with a file that is not the
// pinned one.
export function isRetryable(error: unknown): boolean {
  if (error instanceof SourcesFailedError) {
    return error.failures.some((failure) => failure.error instanceof DownloadError);
  }
  return error instanceof DownloadError;
}

export type FetchOptions = {
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  // The mirror to ask first; null for none. The default is mirrorUrl().
  mirror?: string | null;
};

// Where a pinned file came from: the cache, or the place that served it,
// with the places asked before it that failed.
export type Origin = { cached: boolean; from?: DownloadSource; failures: SourceFailure[] };

// Returns what the import reads from a pinned file, from the cache when it
// holds the file. Otherwise the file is downloaded from the mirror, and from
// the publisher when the mirror cannot be reached or its copy does not match.
// Every copy is checked against the same pin, wherever it came from, and
// nothing that fails it is returned or cached.
export async function fetchPinnedFile<T>(
  file: PinnedFile<T>,
  { cacheDir = CACHE_DIR, fetchImpl = fetch, mirror }: FetchOptions = {},
): Promise<{ content: T } & Origin> {
  const cacheFile = path.join(cacheDir, file.name);
  const cached = await readFile(cacheFile)
    .then((bytes) => file.read(bytes))
    .catch(() => undefined);
  if (cached !== undefined && file.checksum(cached) === file.pin) {
    return { content: cached, cached: true, failures: [] };
  }

  const sources = downloadSources(file, mirror === undefined ? mirrorUrl() : (mirror ?? undefined));
  const failures: SourceFailure[] = [];
  for (const source of sources) {
    let bytes: Uint8Array;
    let content: T | undefined;
    try {
      bytes = await downloadFrom(source.url, fetchImpl);
      content = file.read(bytes);
      if (content === undefined) throw new Error(`${source.url} is not ${file.expected}`);
      const actual = file.checksum(content);
      if (actual !== file.pin) throw file.mismatch(actual, source);
    } catch (error) {
      failures.push({ ...source, error: error instanceof Error ? error : new Error(String(error)) });
      continue;
    }
    await mkdir(cacheDir, { recursive: true });
    await writeFile(`${cacheFile}.tmp`, bytes);
    await rename(`${cacheFile}.tmp`, cacheFile);
    return { content, cached: false, from: source, failures };
  }
  if (failures.length === 1) throw failures[0].error;
  throw new SourcesFailedError(failures);
}

// How a source is named in progress and failure messages.
export function describeSource({ url, mirror }: DownloadSource): string {
  const { host } = new URL(url);
  return mirror ? `the mirror at ${host}` : host;
}

// Why a place's copy of a file was not used, in a few words.
export function describeFailure({ error }: SourceFailure): string {
  if (error instanceof DownloadError) return error.reason;
  if (error.name === "ChecksumError" || error.name === "StudyChecksumError") {
    return "its copy does not match the pinned checksum";
  }
  return error.message;
}

// "cached", or where the file was downloaded from and which places failed
// before that one.
export function describeOrigin({ cached, from, failures }: Origin): string {
  if (cached || !from) return "cached";
  const failed = failures.map(
    (failure) => `${describeSource(failure)} was not used: ${describeFailure(failure)}`,
  );
  return `downloaded from ${describeSource(from)}` + (failed.length > 0 ? ` (${failed.join("; ")})` : "");
}

function parse(bytes: Uint8Array): HelloaoTranslation | undefined {
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(json?.books) ? json : undefined;
  } catch {
    return undefined;
  }
}

// A translation's main file, from the Free Use Bible API.
export function sourceFile(source: BibleSource): PinnedFile<HelloaoTranslation> {
  return {
    name: pinnedFileName(source.id, source.contentSha256, "json"),
    upstreamUrl: source.downloadUrl,
    pin: source.contentSha256,
    mirrored: !source.upstreamOnly,
    read: parse,
    checksum: contentSha256,
    expected: "a Bible translation in JSON",
    mismatch: (actual, served) => new ChecksumError(source, actual, source, served),
  };
}

// Returns the pinned translation, from the cache when it holds it. Throws
// rather than return content that does not match the pin.
export async function fetchSource(
  source: BibleSource,
  options?: FetchOptions,
): Promise<{ translation: HelloaoTranslation } & Origin> {
  const { content, ...origin } = await fetchPinnedFile(sourceFile(source), options);
  return { translation: content, ...origin };
}

// The books of the Bible in an archive of USFM files, one file per book.
// Files for anything else (front matter, a glossary) are passed over.
function parseUsfmArchive(bytes: Uint8Array): UsfmBook[] | undefined {
  let files: Map<string, Uint8Array>;
  try {
    files = readZip(bytes, (name) => /\.u?sfm$/i.test(name));
  } catch {
    return undefined;
  }
  const books: UsfmBook[] = [];
  for (const content of files.values()) {
    const usfm = new TextDecoder().decode(content);
    const id = /^\uFEFF?\s*\\id\s+(\w+)/.exec(usfm)?.[1];
    if (id && bookByUsfm(id)) books.push(parseUsfmBook(usfm));
  }
  return books.length > 0 ? books : undefined;
}

// A translation's formatting file, from its publisher.
export function formattingFile(
  source: BibleSource & { formatting: FormattingSource },
): PinnedFile<UsfmBook[]> {
  const { formatting } = source;
  return {
    name: pinnedFileName(`${source.id}-formatting`, formatting.contentSha256, "zip"),
    upstreamUrl: formatting.downloadUrl,
    pin: formatting.contentSha256,
    mirrored: !formatting.upstreamOnly,
    read: parseUsfmArchive,
    checksum: formattingSha256,
    expected: "a zip archive of USFM files",
    mismatch: (actual, served) => new ChecksumError(source, actual, formatting, served),
  };
}

// Returns the books of a translation's pinned formatting source, from the
// cache when it holds them. Throws rather than return content that does not
// match the pin.
export async function fetchFormatting(
  source: BibleSource & { formatting: FormattingSource },
  options?: FetchOptions,
): Promise<{ books: UsfmBook[] } & Origin> {
  const { content, ...origin } = await fetchPinnedFile(formattingFile(source), options);
  return { books: content, ...origin };
}
