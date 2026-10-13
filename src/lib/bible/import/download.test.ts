import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChecksumError,
  contentSha256,
  download,
  DownloadError,
  fetchFormatting,
  fetchSource,
  formattingSha256,
} from "./download";
import type { HelloaoTranslation } from "./helloao";
import { BIBLE_SOURCES, type BibleSource } from "./sources";
import { parseUsfmBook } from "./usfm";
import { zip } from "./zip.fixture";

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

  it("covers the paragraph and red-letter markup the import reads", () => {
    const edit = (change: (content: unknown[]) => void) => {
      const copy = build("Jesus wept.");
      change(copy.books[0].chapters[0].chapter.content);
      return contentSha256(copy as HelloaoTranslation);
    };
    const verse = (content: unknown[]) => ({ type: "verse", number: 35, content });
    const variants = [
      edit((content) => content.unshift({ type: "line_break" })),
      edit((content) => (content[0] = verse(["Jesus wept.", { lineBreak: true }]))),
      edit((content) => (content[0] = verse([{ text: "Jesus wept.", wordsOfJesus: true }]))),
      edit((content) => (content[0] = verse([{ text: "Jesus wept.", poem: 1 }]))),
    ];
    expect(new Set([source.contentSha256, ...variants]).size).toBe(5);
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

  it("reports an unreachable host as a download error naming the file", async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND example.test") });
    });
    const failure = await fetchSource(source, { cacheDir, fetchImpl: offline }).catch((e) => e);
    expect(failure).toBeInstanceOf(DownloadError);
    expect(failure.url).toBe(source.downloadUrl);
    expect(failure.message).toBe(
      `Could not download ${source.downloadUrl}: the host could not be reached: getaddrinfo ENOTFOUND example.test`,
    );
  });

  it("reports an HTTP failure", async () => {
    await expect(
      fetchSource(source, { cacheDir, fetchImpl: respond(original, 503) }),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("formatting sources", () => {
  const usfm = (verse: string, extra = "") =>
    `\\id JHN World English Bible${extra}\n\\c 11\n\\p\n\\v 35 ${verse}\n`;
  const archive = (verse: string, extra = "") =>
    zip({
      "00-FRTengwebp.usfm": "\\id FRT\n\\ip Preface text before any verse.\n",
      "73-JHNengwebp.usfm": usfm(verse, extra),
      "copr.htm": `<p>Generated ${extra}</p>`,
    });
  const pin = (verse: string) => formattingSha256([parseUsfmBook(usfm(verse))]);
  const formatted = {
    ...source,
    formatting: {
      kind: "wordsOfJesus" as const,
      sourceUrl: "https://example.test/",
      downloadUrl: "https://example.test/usfm.zip",
      contentSha256: pin("\\wj Jesus wept.\\wj*"),
    },
  };
  const respondWith = (bytes: Uint8Array, status = 200) =>
    vi.fn<typeof fetch>(async () => new Response(Buffer.from(bytes), { status }));

  it("pins the words and the markup read, and nothing around them", () => {
    const hashes = [
      "\\wj Jesus wept.\\wj*",
      "Jesus wept.",
      "\\wj Jesus\\wj* wept.",
      "\\wj Jesus wept!\\wj*",
    ].map(pin);
    expect(new Set(hashes).size).toBe(4);
    expect(hashes[0]).toBe(formatted.formatting.contentSha256);
    // A note, a Strong's number or a new build date does not change the pin.
    expect(
      pin('\\wj \\+w Jesus|strong="G2424"\\+w* wept.\\f + \\fr 11:35 \\ft A note.\\f*\\wj*'),
    ).toBe(hashes[0]);
    const paragraph = (marker: string) =>
      formattingSha256([parseUsfmBook(`\\id JHN\n\\c 11\n${marker}\n\\v 35 Jesus wept.`)]);
    expect(paragraph("\\p")).not.toBe(paragraph("\\q1"));
  });

  it("downloads an archive that matches its pin, then serves it from the cache", async () => {
    const fetchImpl = respondWith(archive("\\wj Jesus wept.\\wj*", " built 8 Oct"));

    const first = await fetchFormatting(formatted, { cacheDir, fetchImpl });
    expect(first.cached).toBe(false);
    // The front matter is not a book of the Bible and is passed over.
    expect(first.books).toEqual([
      {
        id: "JHN",
        verses: [
          {
            chapter: 11,
            verse: 35,
            text: "Jesus wept.",
            paragraphs: [0],
            wordsOfJesus: [{ start: 0, end: 11 }],
          },
        ],
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(formatted.formatting.downloadUrl);

    const second = await fetchFormatting(formatted, { cacheDir, fetchImpl });
    expect(second).toEqual({ books: first.books, cached: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects an archive whose markup does not match the pin and caches nothing", async () => {
    const fetchImpl = respondWith(archive("\\wj Jesus\\wj* wept."));
    const failure = fetchFormatting(formatted, { cacheDir, fetchImpl });

    await expect(failure).rejects.toThrow(ChecksumError);
    await expect(failure).rejects.toThrow(formatted.formatting.downloadUrl);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("rejects a download that is not an archive of USFM, and an HTTP failure", async () => {
    const bodies = [new TextEncoder().encode("<html>Not found</html>"), zip({ "copr.htm": "x" })];
    for (const body of bodies) {
      await expect(
        fetchFormatting(formatted, { cacheDir, fetchImpl: respondWith(body) }),
      ).rejects.toThrow("not a zip archive of USFM files");
    }
    await expect(
      fetchFormatting(formatted, { cacheDir, fetchImpl: respondWith(bodies[0], 404) }),
    ).rejects.toThrow("HTTP 404");
  });
});

describe("BIBLE_SOURCES", () => {
  it("pins a formatting source from the publisher for the BSB and the WEB only", () => {
    const formatting = Object.fromEntries(BIBLE_SOURCES.map((s) => [s.id, s.formatting]));
    expect(formatting.kjv).toBeUndefined();
    expect(formatting.bsb).toMatchObject({
      kind: "wordsOfJesus",
      downloadUrl: "https://bereanbible.com/bsb_usfm.zip",
    });
    expect(formatting.web).toMatchObject({
      kind: "paragraphs",
      downloadUrl: "https://ebible.org/Scriptures/engwebp_usfm.zip",
    });
    for (const pinned of [formatting.bsb!, formatting.web!]) {
      expect(pinned.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pinned.sourceUrl).toMatch(/^https:\/\/(berean\.bible|ebible\.org)\//);
    }
  });

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

describe("download", () => {
  const bytes = new TextEncoder().encode("the file");
  const serve = (working: string) =>
    vi.fn<typeof fetch>(async (input) => {
      if (String(input) !== working) throw new TypeError("fetch failed");
      return new Response(bytes);
    });

  it("takes the file from the first URL that answers, in the order given", async () => {
    const urls = ["https://mirror.test/file", "https://upstream.test/file"];

    const mirrorUp = serve(urls[0]);
    expect(await download(urls, mirrorUp)).toEqual(bytes);
    expect(mirrorUp).toHaveBeenCalledTimes(1);

    const mirrorDown = serve(urls[1]);
    expect(await download(urls, mirrorDown)).toEqual(bytes);
    expect(mirrorDown.mock.calls.map(([input]) => input)).toEqual(urls);
  });

  it("reports the last URL when none answers", async () => {
    const failure = await download(["https://a.test/x", "https://b.test/x"], serve("nowhere")).catch(
      (error) => error,
    );
    expect(failure).toBeInstanceOf(DownloadError);
    expect(failure.url).toBe("https://b.test/x");
  });
});
