import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { bookByUsfm } from "../books";
import type { HelloaoTranslation } from "./helloao";
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
  constructor(
    source: BibleSource,
    actual: string,
    // The pinned file: the source itself, or its formatting source.
    file: Pick<BibleSource, "downloadUrl" | "contentSha256"> = source,
  ) {
    super(
      `Checksum mismatch for ${source.abbrev} (${file.downloadUrl}).\n` +
        `  pinned: ${file.contentSha256}\n` +
        `  got:    ${actual}\n` +
        "The upstream text has changed since it was pinned. Review the new file, " +
        "then update the pin in src/lib/bible/import/sources.ts.",
    );
    this.name = "ChecksumError";
  }
}

function parse(bytes: Uint8Array): HelloaoTranslation | undefined {
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(json?.books) ? json : undefined;
  } catch {
    return undefined;
  }
}

// Returns the pinned translation, from the cache when it holds it. Throws
// ChecksumError rather than return content that does not match the pin.
export async function fetchSource(
  source: BibleSource,
  { cacheDir = CACHE_DIR, fetchImpl = fetch } = {},
): Promise<{ translation: HelloaoTranslation; cached: boolean }> {
  const file = path.join(
    cacheDir,
    `${source.id}-${source.contentSha256.slice(0, 12)}.json`,
  );

  const cached = await readFile(file).then(parse, () => undefined);
  if (cached && contentSha256(cached) === source.contentSha256) {
    return { translation: cached, cached: true };
  }

  const response = await fetchImpl(source.downloadUrl);
  if (!response.ok) {
    throw new Error(
      `Could not download ${source.downloadUrl}: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const translation = parse(bytes);
  if (!translation) {
    throw new Error(`${source.downloadUrl} is not a Bible translation in JSON`);
  }
  const actual = contentSha256(translation);
  if (actual !== source.contentSha256) throw new ChecksumError(source, actual);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  return { translation, cached: false };
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

// Returns the books of a translation's pinned formatting source, from the
// cache when it holds them. Throws ChecksumError rather than return content
// that does not match the pin.
export async function fetchFormatting(
  source: BibleSource & { formatting: FormattingSource },
  { cacheDir = CACHE_DIR, fetchImpl = fetch } = {},
): Promise<{ books: UsfmBook[]; cached: boolean }> {
  const { downloadUrl, contentSha256: pinned } = source.formatting;
  const file = path.join(cacheDir, `${source.id}-formatting-${pinned.slice(0, 12)}.zip`);

  const cached = await readFile(file).then(parseUsfmArchive, () => undefined);
  if (cached && formattingSha256(cached) === pinned) {
    return { books: cached, cached: true };
  }

  const response = await fetchImpl(downloadUrl);
  if (!response.ok) {
    throw new Error(`Could not download ${downloadUrl}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const books = parseUsfmArchive(bytes);
  if (!books) throw new Error(`${downloadUrl} is not a zip archive of USFM files`);
  const actual = formattingSha256(books);
  if (actual !== pinned) throw new ChecksumError(source, actual, source.formatting);

  await mkdir(cacheDir, { recursive: true });
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  return { books, cached: false };
}
