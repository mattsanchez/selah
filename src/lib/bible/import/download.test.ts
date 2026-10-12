import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChecksumError, contentSha256, fetchSource } from "./download";
import type { HelloaoTranslation } from "./helloao";
import { BIBLE_SOURCES, type BibleSource } from "./sources";

const build = (text: string, metadata: object = {}) => ({
  translation: metadata,
  books: [
    {
      id: "JHN",
      chapters: [
        {
          thisChapterAudioLinks: metadata,
          chapter: {
            number: 11,
            content: [{ type: "verse" as const, number: 35, content: [text] }],
            footnotes: [],
          },
        },
      ],
    },
  ],
});
const original: HelloaoTranslation = build("Jesus wept.");
const source: BibleSource = {
  ...BIBLE_SOURCES[0],
  downloadUrl: "https://example.test/complete.json",
  contentSha256: contentSha256(original),
};
const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "selah-bible-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("contentSha256", () => {
  it("covers the text and ignores the metadata around it", () => {
    expect(contentSha256(build("Jesus wept.", { audio: "new-link" }))).toBe(
      source.contentSha256,
    );
    expect(contentSha256(build("Jesus wept!"))).not.toBe(source.contentSha256);
    const renumbered = build("Jesus wept.");
    renumbered.books[0].chapters[0].chapter.number = 12;
    expect(contentSha256(renumbered)).not.toBe(source.contentSha256);
  });
});

describe("fetchSource", () => {
  it("downloads a file that matches its pin, then serves it from the cache", async () => {
    const fetchImpl = respond(original);

    const first = await fetchSource(source, { cacheDir, fetchImpl });
    expect(first).toEqual({ translation: original, cached: false });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(source.downloadUrl);

    const second = await fetchSource(source, { cacheDir, fetchImpl });
    expect(second).toEqual({ translation: original, cached: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a download whose text does not match the pin and caches nothing", async () => {
    const fetchImpl = respond(build("Jesus laughed."));

    await expect(fetchSource(source, { cacheDir, fetchImpl })).rejects.toThrow(ChecksumError);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("rejects a download that is not a translation", async () => {
    for (const body of ["<html>Service unavailable</html>", { error: "not found" }]) {
      await expect(
        fetchSource(source, { cacheDir, fetchImpl: respond(body) }),
      ).rejects.toThrow("not a Bible translation");
    }
  });

  it("downloads again when the pin changes, ignoring the old cache entry", async () => {
    await fetchSource(source, { cacheDir, fetchImpl: respond(original) });
    const revised = build("Jesus wept. (rev. 2)");
    const fetchImpl = respond(revised);

    const result = await fetchSource(
      { ...source, contentSha256: contentSha256(revised) },
      { cacheDir, fetchImpl },
    );
    expect(result).toEqual({ translation: revised, cached: false });
  });

  it("reports an HTTP failure", async () => {
    await expect(
      fetchSource(source, { cacheDir, fetchImpl: respond(original, 503) }),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("BIBLE_SOURCES", () => {
  it("pins BSB (the default), WEB and KJV with license and attribution", () => {
    expect(BIBLE_SOURCES.map((s) => s.id)).toEqual(["bsb", "web", "kjv"]);
    for (const s of BIBLE_SOURCES) {
      expect(s.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.downloadUrl).toMatch(/^https:\/\/bible\.helloao\.org\/api\/.+\/complete\.json$/);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      expect(s.license).toMatch(/^Public domain/);
      expect(s.attribution).not.toBe("");
      expect(s.abbrev).toBe(s.id.toUpperCase());
    }
  });
});
