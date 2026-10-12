import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { HelloaoTranslation } from "./helloao";
import type { BibleSource } from "./sources";

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

export class ChecksumError extends Error {
  constructor(source: BibleSource, actual: string) {
    super(
      `Checksum mismatch for ${source.abbrev} (${source.downloadUrl}).\n` +
        `  pinned: ${source.contentSha256}\n` +
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
