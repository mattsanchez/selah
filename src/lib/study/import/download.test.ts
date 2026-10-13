import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { zip } from "@/lib/bible/import/zip.fixture";

import type { CommentarySource, StudyDownload } from "../sources";
import {
  crossReferencesSha256,
  fetchCommentary,
  fetchCrossReferences,
  StudyChecksumError,
  tyndaleSha256,
} from "./download";
import { parseCrossReferences } from "./openbible";
import { parseTyndaleItems } from "./tyndale";

const HEADER = "From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY";
const TSV = `${HEADER} 2026-10-12\nJohn.3.16\tRom.5.8\t986\nJohn.3.16\tJohn.3.15\t503\n`;
const NOTES = `<items release="1.25">
<item name="John.3.16" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>John.3.16</refs>
<body><p class="sn-text">God loved the world.</p></body>
</item>
</items>`;

const crossReferences = (tsv = TSV): StudyDownload => ({
  id: "cross-references",
  name: "Cross references",
  license: "CC BY 4.0",
  attribution: "Cross references from OpenBible.info",
  sourceUrl: "https://example.org/",
  downloadUrl: "https://example.org/cross-references.zip",
  contentSha256: crossReferencesSha256(parseCrossReferences(tsv).rows),
});

const tyndale: CommentarySource = {
  id: "tyndale",
  name: "Tyndale Open Study Notes",
  kind: "study_notes",
  position: 4,
  license: "CC BY-SA 4.0",
  attribution: "Adapted from Tyndale Open Study Notes.",
  sourceUrl: "https://example.org/",
  downloadUrl: "https://example.org/notes.zip",
  contentSha256: tyndaleSha256(parseTyndaleItems(NOTES)),
  format: "tyndale",
};

function server(files: Record<string, string>, status = 200) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    return new Response(status === 200 ? Buffer.from(zip(files)) : "gone", { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "selah-study-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("fetchCrossReferences", () => {
  it("downloads, verifies and caches the archive", async () => {
    const { calls, fetchImpl } = server({ "cross_references.txt": TSV });
    const first = await fetchCrossReferences(crossReferences(), { cacheDir, fetchImpl });
    expect(first.cached).toBe(false);
    expect(first.rows).toHaveLength(2);
    expect(await readdir(cacheDir)).toHaveLength(1);

    const second = await fetchCrossReferences(crossReferences(), { cacheDir, fetchImpl });
    expect(second.cached).toBe(true);
    expect(second.rows).toEqual(first.rows);
    expect(calls).toHaveLength(1);
  });

  it("is pinned to the references, not to the date in the header", async () => {
    const rebuilt = TSV.replace("2026-10-12", "2026-10-13");
    const { fetchImpl } = server({ "cross_references.txt": rebuilt });
    const { rows } = await fetchCrossReferences(crossReferences(), { cacheDir, fetchImpl });
    expect(rows).toHaveLength(2);
  });

  it("refuses content that does not match the pin, and caches nothing", async () => {
    const { fetchImpl } = server({ "cross_references.txt": TSV.replace("986", "987") });
    await expect(
      fetchCrossReferences(crossReferences(), { cacheDir, fetchImpl }),
    ).rejects.toBeInstanceOf(StudyChecksumError);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("says so when the download fails or is not the archive", async () => {
    await expect(
      fetchCrossReferences(crossReferences(), { cacheDir, fetchImpl: server({}, 404).fetchImpl }),
    ).rejects.toThrow(/HTTP 404/);
    await expect(
      fetchCrossReferences(crossReferences(), {
        cacheDir,
        fetchImpl: server({ "readme.txt": "hello" }).fetchImpl,
      }),
    ).rejects.toThrow(/is not the archive/);
  });
});

describe("fetchCommentary", () => {
  it("reads the study notes out of the publisher's archive", async () => {
    const { fetchImpl } = server({
      "Tyndale Open Study Notes/_README.txt": "License",
      "Tyndale Open Study Notes/StudyNotes.xml": NOTES,
    });
    const { records, skipped, cached } = await fetchCommentary(tyndale, { cacheDir, fetchImpl });
    expect(cached).toBe(false);
    expect(skipped).toEqual([]);
    expect(records).toEqual([
      { verseStart: 43003016, verseEnd: 43003016, html: "<p>God loved the world.</p>" },
    ]);
  });

  it("refuses notes that do not match the pin", async () => {
    const { fetchImpl } = server({ "StudyNotes.xml": NOTES.replace("loved", "hated") });
    await expect(fetchCommentary(tyndale, { cacheDir, fetchImpl })).rejects.toThrow(
      /Checksum mismatch for Tyndale Open Study Notes/,
    );
  });
});
