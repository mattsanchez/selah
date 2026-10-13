import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PinnedFile } from "@/lib/bible/import/download";

import {
  buildDataRelease,
  MANIFEST_FILE,
  NOTICES_FILE,
  PinCheckError,
  renderReleaseNotes,
  type Manifest,
} from "./build";
import { pinnedFiles, type CatalogEntry } from "./catalog";
import { publishDataRelease, type Gh } from "./publish";

// A pinned file whose pin is simply its text.
const entry = (id: string, text: string, mirrored = true): CatalogEntry => ({
  id,
  title: `The ${id} file`,
  format: "openbible-zip",
  file: {
    name: `${id}-000000000000.zip`,
    upstreamUrl: `https://publisher.test/${id}.zip`,
    pin: text,
    mirrored,
    read: (bytes) => new TextDecoder().decode(bytes),
    checksum: (content) => content,
    expected: "a text file",
    mismatch: () => new Error("mismatch"),
  } as PinnedFile<string> as PinnedFile<unknown>,
  pinnedBy: "the test",
  sourcePage: "https://publisher.test/",
  license: "CC BY 4.0",
  attribution: `From ${id}`,
  notice: `Notice for ${id}.`,
});

const entries = [entry("one", "first"), entry("two", "second")];
const TAG = "data-v9";

let dir: string;
let cacheDir: string;
let outDir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "selah-data-release-"));
  cacheDir = path.join(dir, "cache");
  outDir = path.join(dir, "out", TAG);
  await mkdir(cacheDir);
  await writeFile(path.join(cacheDir, entries[0].file.name), "first");
  await writeFile(path.join(cacheDir, entries[1].file.name), "second");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const build = (list: readonly CatalogEntry[] = entries) =>
  buildDataRelease({ entries: list, cacheDir, outDir, tag: TAG, now: new Date("2026-10-13T12:00:00Z") });

describe("buildDataRelease", () => {
  it("stages each pinned file as it is in the cache, with a manifest and the notices", async () => {
    const manifest = await build();

    expect((await readdir(outDir)).sort()).toEqual(
      [MANIFEST_FILE, NOTICES_FILE, "one-000000000000.zip", "two-000000000000.zip"].sort(),
    );
    expect(await readFile(path.join(outDir, "one-000000000000.zip"), "utf8")).toBe("first");
    expect(JSON.parse(await readFile(path.join(outDir, MANIFEST_FILE), "utf8"))).toEqual(manifest);
    expect(manifest).toMatchObject({
      schema: 1,
      release: TAG,
      repository: "mattsanchez/selah",
      baseUrl: `https://github.com/mattsanchez/selah/releases/download/${TAG}`,
      createdAt: "2026-10-13T12:00:00.000Z",
      upstreamOnly: [],
    });
    expect(manifest.files[0]).toMatchObject({
      file: "one-000000000000.zip",
      id: "one",
      upstreamUrl: "https://publisher.test/one.zip",
      size: 5,
      // SHA-256 of the raw bytes, "first".
      sha256: "a7937b64b8caa58f03721bb6bacf5c78cb235febe0e70b1b84cd99541461a08e",
      pin: { sha256: "first", by: "the test" },
      license: "CC BY 4.0",
      attribution: "From one",
    });
    expect(manifest.files[0].fetchedAt).toMatch(/^\d{4}-\d\d-\d\dT/);

    const notices = await readFile(path.join(outDir, NOTICES_FILE), "utf8");
    for (const { file, notice, attribution } of entries) {
      expect(notices).toContain(`## ${file.name}`);
      expect(notices).toContain(notice);
      expect(notices).toContain(attribution);
    }
  });

  it("refuses a file that fails its pin, and stages nothing", async () => {
    await writeFile(path.join(cacheDir, entries[1].file.name), "second, revised upstream");

    const failure = await build().catch((error) => error);
    expect(failure).toBeInstanceOf(PinCheckError);
    expect(failure.problems).toEqual([
      "two-000000000000.zip does not match its pin (pinned second, got second, revised upstream)",
    ]);
    await expect(readdir(outDir)).rejects.toThrow();
  });

  it("refuses when a file is missing from the cache or is not that kind of file", async () => {
    await rm(path.join(cacheDir, entries[0].file.name));
    const unreadable = entry("three", "third");
    unreadable.file.read = () => undefined;
    await writeFile(path.join(cacheDir, unreadable.file.name), "<html>");

    const failure = await build([...entries, unreadable]).catch((error) => error);
    expect(failure).toBeInstanceOf(PinCheckError);
    expect(failure.problems).toHaveLength(2);
    expect(failure.message).toContain("one-000000000000.zip is not in");
    expect(failure.message).toContain("three-000000000000.zip is not a text file");
  });

  it("leaves an upstream-only file out and lists it as such", async () => {
    const manifest = await build([...entries, entry("three", "third", false)]);
    expect(manifest.files.map((file) => file.id)).toEqual(["one", "two"]);
    expect(manifest.upstreamOnly).toEqual([
      { id: "three", upstreamUrl: "https://publisher.test/three.zip", pin: "third" },
    ]);
    expect(await readFile(path.join(outDir, NOTICES_FILE), "utf8")).not.toContain("three");
  });

  it("only builds a release whose tag marks it as data", async () => {
    await expect(
      buildDataRelease({ entries, cacheDir, outDir, tag: "v1.0.0" }),
    ).rejects.toThrow('starts with "data-"');
  });

  it("says on the release page that it is not a version of Selah", async () => {
    const notes = renderReleaseNotes(await build());
    expect(notes).toMatch(/^\*\*This is a data release, not a version of Selah\.\*\*/);
    expect(notes).toContain("`one-000000000000.zip`");
  });
});

// A stand-in for `gh` that keeps one release in memory.
function fakeGh(initial?: { isDraft: boolean; assets: { name: string; size: number }[] }) {
  let release = initial && { ...initial, url: "https://github.test/release" };
  const calls: string[][] = [];
  const gh: Gh = async (args) => {
    calls.push(args);
    const [, command] = args;
    if (command === "view") {
      return release
        ? { code: 0, stdout: JSON.stringify(release), stderr: "" }
        : { code: 1, stdout: "", stderr: "release not found" };
    }
    if (command === "create") release = { isDraft: true, assets: [], url: "https://github.test/release" };
    if (command === "upload") {
      for (const file of args.slice(5)) {
        release!.assets.push({ name: path.basename(file), size: (await readFile(file)).length });
      }
    }
    if (command === "edit") release!.isDraft = false;
    return { code: 0, stdout: "", stderr: "" };
  };
  const commands = () => calls.map((args) => args[1]).filter((command) => command !== "view");
  return { gh, calls, commands, release: () => release };
}

describe("publishDataRelease", () => {
  const publish = (manifest: Manifest, gh: Gh, env = {}) =>
    publishDataRelease({ entries, manifest, dir: outDir, gh, env, log: () => {} });

  it("creates a draft that is not the latest release, uploads, then publishes", async () => {
    const manifest = await build();
    const { gh, calls, commands, release } = fakeGh();

    const result = await publish(manifest, gh);
    expect(result).toEqual({ url: "https://github.test/release", published: true });
    expect(commands()).toEqual(["create", "upload", "edit"]);

    const create = calls.find((args) => args[1] === "create")!;
    expect(create).toEqual(
      expect.arrayContaining([TAG, "--repo", "mattsanchez/selah", "--draft", "--prerelease", "--latest=false"]),
    );
    expect(create[create.indexOf("--title") + 1]).toContain("not a version of Selah");
    expect(calls.find((args) => args[1] === "edit")).toEqual(
      expect.arrayContaining(["--draft=false", "--prerelease", "--latest=false"]),
    );
    expect(release()!.assets.map((asset) => asset.name).sort()).toEqual(
      [MANIFEST_FILE, NOTICES_FILE, "one-000000000000.zip", "two-000000000000.zip"].sort(),
    );
    // Nothing deletes or overwrites.
    expect(calls.flat()).not.toContain("--clobber");
    expect(calls.map((args) => args[1])).not.toContain("delete");
  });

  it("refuses to publish a file that fails its pin", async () => {
    const manifest = await build();
    // Changed after staging: the bytes about to be uploaded are checked again.
    await writeFile(path.join(outDir, entries[0].file.name), "tampered");
    const { gh, commands } = fakeGh();

    await expect(publish(manifest, gh)).rejects.toThrow(PinCheckError);
    expect(commands()).toEqual([]);
  });

  it("refuses to publish anything but the pinned files, the manifest and the notices", async () => {
    const manifest = await build();
    await writeFile(path.join(outDir, "extra.zip"), "something else");
    const { gh, commands } = fakeGh();

    await expect(publish(manifest, gh)).rejects.toThrow("and nothing else");
    expect(commands()).toEqual([]);
  });

  it("refuses to run in CI", async () => {
    const manifest = await build();
    const { gh, calls } = fakeGh();
    await expect(publish(manifest, gh, { CI: "true" })).rejects.toThrow("never by CI");
    await expect(publish(manifest, gh, { GITHUB_ACTIONS: "true" })).rejects.toThrow("never by CI");
    expect(calls).toEqual([]);
  });

  it("never changes a published data release", async () => {
    const manifest = await build();
    const assets = manifest.files.map((file) => ({ name: file.file, size: file.size }));

    const same = fakeGh({ isDraft: false, assets });
    expect(await publish(manifest, same.gh)).toEqual({
      url: "https://github.test/release",
      published: false,
    });
    expect(same.commands()).toEqual([]);

    const different = fakeGh({ isDraft: false, assets: [{ ...assets[0], size: 99 }, assets[1]] });
    await expect(publish(manifest, different.gh)).rejects.toThrow("is never changed");
    expect(different.commands()).toEqual([]);
  });

  it("finishes a draft an earlier run left behind, uploading only what is missing", async () => {
    const manifest = await build();
    const { gh, calls, commands } = fakeGh({
      isDraft: true,
      assets: [{ name: manifest.files[0].file, size: manifest.files[0].size }],
    });

    await publish(manifest, gh);
    expect(commands()).toEqual(["upload", "edit"]);
    const uploaded = calls.find((args) => args[1] === "upload")!.slice(5).map((file) => path.basename(file));
    expect(uploaded.sort()).toEqual([MANIFEST_FILE, NOTICES_FILE, "two-000000000000.zip"].sort());
  });
});

describe("pinnedFiles", () => {
  it("lists every file the imports download, each with a notice", () => {
    const files = pinnedFiles();
    expect(files.map((file) => file.id)).toEqual([
      "bsb",
      "bsb-formatting",
      "web",
      "web-formatting",
      "kjv",
      "cross-references",
      "matthew-henry",
      "jamieson-fausset-brown",
      "adam-clarke",
      "tyndale",
    ]);
    expect(new Set(files.map((file) => file.file.name)).size).toBe(files.length);
    for (const { file, license, attribution, notice } of files) {
      expect(file.name).toMatch(/^[a-z-]+-[0-9a-f]{12}\.(json|zip)$/);
      expect(file.name).toContain(file.pin.slice(0, 12));
      expect(file.upstreamUrl).toMatch(/^https:\/\//);
      expect(license).toMatch(/^(Public domain|CC BY)/);
      expect(attribution).not.toBe("");
      expect(notice.length).toBeGreaterThan(100);
    }
    // The archive is Tyndale's own, not an adaptation of it.
    expect(files.at(-1)!.attribution).toMatch(/^Tyndale Open Study Notes\./);
  });
});
