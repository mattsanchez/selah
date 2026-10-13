import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChecksumError,
  contentSha256,
  describeOrigin,
  DownloadError,
  fetchFormatting,
  fetchSource,
  formattingFile,
  formattingSha256,
  isRetryable,
  sourceFile,
  SourcesFailedError,
  type SourceFailure,
} from "./download";
import type { HelloaoTranslation } from "./helloao";
import { DATA_RELEASE, dataReleaseUrl, downloadSources, mirrorUrl } from "./mirror";
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
    expect(first).toMatchObject({ translation: original, cached: false });
    // The publisher, when no mirror is configured.
    expect(first.from).toEqual({ url: source.downloadUrl, mirror: false });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(source.downloadUrl);

    const second = await fetchSource(source, { cacheDir, fetchImpl });
    expect(second).toEqual({ translation: original, cached: true, failures: [] });
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
    expect(result).toMatchObject({ translation: revised, cached: false });
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
    expect(second).toEqual({ books: first.books, cached: true, failures: [] });
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

describe("the mirror", () => {
  const mirror = "https://mirror.test/data-v9";
  const mirrorCopy = `${mirror}/${sourceFile(source).name}`;
  const body = (translation: HelloaoTranslation) => new Response(JSON.stringify(translation));
  const offline = () => {
    throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") });
  };
  // Answers each URL with what `routes` gives for it.
  const serve = (routes: Record<string, () => Response>) =>
    vi.fn<typeof fetch>(async (input) => routes[String(input)]());
  const asked = (fetchImpl: ReturnType<typeof serve>) => fetchImpl.mock.calls.map(([url]) => url);

  it("is asked first, and the publisher is not asked when it has the file", async () => {
    const fetchImpl = serve({ [mirrorCopy]: () => body(original), [source.downloadUrl]: offline });

    const result = await fetchSource(source, { cacheDir, fetchImpl, mirror });
    expect(result).toEqual({
      translation: original,
      cached: false,
      from: { url: mirrorCopy, mirror: true },
      failures: [],
    });
    expect(asked(fetchImpl)).toEqual([mirrorCopy]);
    expect(describeOrigin(result)).toBe("downloaded from the mirror at mirror.test");
  });

  it("loads the pinned copy from the mirror when the publisher's file has moved on", async () => {
    const fetchImpl = serve({
      [mirrorCopy]: () => body(original),
      [source.downloadUrl]: () => body(build("Jesus wept. (rev. 2)")),
    });

    const { translation, failures } = await fetchSource(source, { cacheDir, fetchImpl, mirror });
    expect(translation).toEqual(original);
    expect(failures).toEqual([]);
    expect(await readdir(cacheDir)).toEqual([sourceFile(source).name]);
  });

  it("falls back to the publisher when the mirror cannot be reached", async () => {
    for (const down of [offline, () => new Response("Not Found", { status: 404 })]) {
      const dir = await mkdtemp(path.join(cacheDir, "run-"));
      const fetchImpl = serve({ [mirrorCopy]: down, [source.downloadUrl]: () => body(original) });

      const result = await fetchSource(source, { cacheDir: dir, fetchImpl, mirror });
      expect(result.translation).toEqual(original);
      expect(result.from).toEqual({ url: source.downloadUrl, mirror: false });
      expect(result.failures).toMatchObject([{ url: mirrorCopy, mirror: true }]);
      expect(result.failures[0].error).toBeInstanceOf(DownloadError);
      expect(asked(fetchImpl)).toEqual([mirrorCopy, source.downloadUrl]);
      expect(describeOrigin(result)).toMatch(
        /^downloaded from example\.test \(the mirror at mirror\.test was not used: /,
      );
    }
  });

  it("is trusted no more than the publisher: a copy that fails the pin is passed over", async () => {
    const fetchImpl = serve({
      [mirrorCopy]: () => body(build("Jesus laughed.")),
      [source.downloadUrl]: () => body(original),
    });

    const result = await fetchSource(source, { cacheDir, fetchImpl, mirror });
    expect(result.translation).toEqual(original);
    expect(result.from?.mirror).toBe(false);
    expect(result.failures[0].error).toBeInstanceOf(ChecksumError);
    expect(result.failures[0].error.message).toContain(mirrorCopy);
    expect(result.failures[0].error.message).not.toContain("upstream text has changed");
  });

  it("reports every place when none has the pinned file, and caches nothing", async () => {
    const changed = () => body(build("Jesus wept. (rev. 2)"));

    const neither = await fetchSource(source, {
      cacheDir,
      mirror,
      fetchImpl: serve({ [mirrorCopy]: offline, [source.downloadUrl]: changed }),
    }).catch((error) => error);
    expect(neither).toBeInstanceOf(SourcesFailedError);
    expect(neither.failures.map((failure: SourceFailure) => [failure.url, failure.error.name])).toEqual([
      [mirrorCopy, "DownloadError"],
      [source.downloadUrl, "ChecksumError"],
    ]);
    // The mirror may be back later, and it has the pinned copy.
    expect(isRetryable(neither)).toBe(true);

    const bothChanged = await fetchSource(source, {
      cacheDir,
      mirror,
      fetchImpl: serve({ [mirrorCopy]: changed, [source.downloadUrl]: changed }),
    }).catch((error) => error);
    expect(bothChanged).toBeInstanceOf(SourcesFailedError);
    expect(isRetryable(bothChanged)).toBe(false);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("is not asked when turned off, or for a file that is not in it", async () => {
    const fetchImpl = serve({ [source.downloadUrl]: () => body(original) });
    await fetchSource(source, { cacheDir, fetchImpl, mirror: null });
    expect(asked(fetchImpl)).toEqual([source.downloadUrl]);

    const upstreamOnly = { ...source, id: "other", upstreamOnly: true };
    const second = serve({ [source.downloadUrl]: () => body(original) });
    await fetchSource(upstreamOnly, { cacheDir, fetchImpl: second, mirror });
    expect(asked(second)).toEqual([source.downloadUrl]);
  });

  it("serves formatting files under their own names", async () => {
    const withFormatting = BIBLE_SOURCES.find((s) => s.formatting)!;
    const { name } = formattingFile({ ...withFormatting, formatting: withFormatting.formatting! });
    expect(name).toBe(
      `${withFormatting.id}-formatting-${withFormatting.formatting!.contentSha256.slice(0, 12)}.zip`,
    );
  });
});

describe("mirrorUrl", () => {
  it("is the data release this version is pinned against, unless overridden", () => {
    expect(DATA_RELEASE).toMatch(/^data-/);
    expect(mirrorUrl({})).toBe(
      `https://github.com/mattsanchez/selah/releases/download/${DATA_RELEASE}`,
    );
    expect(mirrorUrl({ SELAH_DATA_MIRROR: "  " })).toBe(dataReleaseUrl());
    expect(dataReleaseUrl("data-v7")).toBe(
      "https://github.com/mattsanchez/selah/releases/download/data-v7",
    );
  });

  it("can be another mirror, or off", () => {
    expect(mirrorUrl({ SELAH_DATA_MIRROR: "https://files.example.org/selah/" })).toBe(
      "https://files.example.org/selah",
    );
    for (const off of ["off", "OFF", "none", "false", "0"]) {
      expect(mirrorUrl({ SELAH_DATA_MIRROR: off })).toBeUndefined();
    }
    expect(() => mirrorUrl({ SELAH_DATA_MIRROR: "files.example.org" })).toThrow("SELAH_DATA_MIRROR");
    expect(() => mirrorUrl({ SELAH_DATA_MIRROR: "ftp://files.example.org" })).toThrow("http");
  });

  it("puts the mirror's copy before the publisher's", () => {
    const file = { name: "bsb-a997d84c4cdc.json", upstreamUrl: "https://up.test/x", mirrored: true };
    expect(downloadSources(file, "https://m.test/v1")).toEqual([
      { url: "https://m.test/v1/bsb-a997d84c4cdc.json", mirror: true },
      { url: "https://up.test/x", mirror: false },
    ]);
    expect(downloadSources(file, undefined)).toEqual([{ url: "https://up.test/x", mirror: false }]);
    expect(downloadSources({ ...file, mirrored: false }, "https://m.test/v1")).toEqual([
      { url: "https://up.test/x", mirror: false },
    ]);
  });

  it("reads the override from the environment when no mirror is given", async () => {
    vi.stubEnv("SELAH_DATA_MIRROR", "https://own.test/files");
    try {
      const own = `https://own.test/files/${sourceFile(source).name}`;
      const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(original)));
      const { from } = await fetchSource(source, { cacheDir, fetchImpl });
      expect(from).toEqual({ url: own, mirror: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
