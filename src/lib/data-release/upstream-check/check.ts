import { createHash } from "node:crypto";

import { DownloadError } from "@/lib/bible/import/download";
import type { HelloaoTranslation } from "@/lib/bible/import/helloao";
import type { UsfmBook } from "@/lib/bible/import/usfm";
import { formatVerseId } from "@/lib/bible/verse-id";

import { MANIFEST_FILE, type Manifest } from "../build";
import type { CatalogEntry } from "../catalog";
import type { UpstreamCheckConfig } from "./config";
import { diffUnits, isEmpty, type Counted, type Example } from "./diff";
import { compareSources, formattedSource, licenseStatements, readUnits, type Family } from "./read";

// Fetches every pinned file from its publisher and says how it differs from
// the copy that was pinned, which is the one in Selah's mirror. It only
// reads: nothing here changes a pin, a fixture, the cache or the mirror.

// The file at a URL, and the URL that served it once redirects were followed.
// Throws a DownloadError when it cannot be had.
export type Fetcher = (url: string) => Promise<{ bytes: Uint8Array; url: string }>;

export type Finding =
  // The file was built again and what the import reads from it is the same.
  | { kind: "rebuild"; note: string }
  | { kind: "wording"; count: number; examples: Example[] }
  | {
      kind: "numbering";
      before: number;
      after: number;
      added: Counted;
      removed: Counted;
      renumbered: { count: number; examples: { from: string; to: string }[] };
    }
  // Verses whose words are the same and whose formatting is not.
  | { kind: "formatting"; count: number; byFacet: Record<string, number>; labels: string[] }
  // Commentary entries and study notes.
  | {
      kind: "entries";
      before: number;
      after: number;
      added: Counted;
      removed: Counted;
      moved: { count: number; examples: { from: string; to: string }[] };
      reworded: { count: number; examples: Example[] };
      markup: Counted;
    }
  // Cross references.
  | {
      kind: "references";
      before: number;
      after: number;
      added: Counted;
      removed: Counted;
      votes: number;
      // Of those, how many are voted below zero in one copy only.
      crossedZero: number;
    }
  | { kind: "license"; changes: { where: string; before?: string; after?: string }[] }
  // The publisher did not serve the file, or served something that is not it.
  | { kind: "unreachable"; reason: string; since: string; persisted: boolean }
  // The publisher's address redirects somewhere else.
  | { kind: "moved"; to: string; since: string; persisted: boolean }
  // The file changed and the import's own reader fails on the new one.
  | { kind: "unreadable"; reason: string }
  // The file changed and there is no pinned copy to compare it with.
  | { kind: "unclassified"; reason: string }
  // A translation's two sources against each other, before and after.
  | {
      kind: "divergence";
      // The other source's catalog id.
      with: string;
      before: number;
      after: number;
      newly: Counted;
      resolved: number;
      // Verses whose marks the import cannot place for it.
      marks: "paragraph breaks" | "red-letter text";
      unplacedBefore: number;
      unplacedAfter: number;
    };

export type SourceResult = {
  entry: CatalogEntry;
  // identical: the publisher serves the mirrored bytes.
  // same-content: other bytes, the same pin.
  // changed: the pin no longer matches.
  // unavailable: the file could not be fetched or read.
  status: "identical" | "same-content" | "changed" | "unavailable";
  // What the publisher's file hashes to, where the pin is `entry.file.pin`.
  checksum?: string;
  findings: Finding[];
};

// What one run leaves for the next: since when each source has been
// unreachable or moved, by catalog id. A source that is fine has no entry.
export type CheckState = { unavailable: Record<string, { since: string; what: string }> };

export const EMPTY_STATE: CheckState = { unavailable: {} };

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// A Fetcher over HTTP. A host that does not answer, or answers with a server
// error, is asked `attempts` times.
export function httpFetcher({
  fetchImpl = fetch,
  attempts = 3,
  timeoutMs = 300_000,
  pauseMs = 5_000,
}: { fetchImpl?: typeof fetch; attempts?: number; timeoutMs?: number; pauseMs?: number } = {}): Fetcher {
  return async (url) => {
    let failure: DownloadError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, pauseMs));
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok) {
          return { bytes: new Uint8Array(await response.arrayBuffer()), url: response.url || url };
        }
        failure = new DownloadError(url, `HTTP ${response.status}`);
        // The publisher has answered: the file is not there.
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        failure = new DownloadError(
          url,
          `the host could not be reached: ${cause instanceof Error ? cause.message : message(error)}`,
          { cause: error },
        );
      }
    }
    throw failure!;
  };
}

// Whether a redirect led to another place, rather than to the same file over
// https or on a CDN's query string.
function movedTo(asked: string, served: string): string | undefined {
  try {
    const [from, to] = [new URL(asked), new URL(served)];
    return from.host === to.host && from.pathname === to.pathname ? undefined : to.origin + to.pathname;
  } catch {
    return undefined;
  }
}

function contentFindings(family: Family, diff: ReturnType<typeof diffUnits>): Finding[] {
  if (family === "references") {
    return [
      {
        kind: "references",
        before: diff.before,
        after: diff.after,
        added: diff.added,
        removed: diff.removed,
        votes: diff.facets.count,
        crossedZero: diff.crossedZero,
      },
    ];
  }
  if (family === "entries") {
    return [
      {
        kind: "entries",
        before: diff.before,
        after: diff.after,
        added: diff.added,
        removed: diff.removed,
        moved: diff.renumbered,
        reworded: diff.wording,
        markup: { count: diff.facets.count, labels: diff.facets.labels },
      },
    ];
  }
  const findings: Finding[] = [];
  if (diff.wording.count > 0) findings.push({ kind: "wording", ...diff.wording });
  if (diff.added.count + diff.removed.count + diff.renumbered.count > 0) {
    findings.push({
      kind: "numbering",
      before: diff.before,
      after: diff.after,
      added: diff.added,
      removed: diff.removed,
      renumbered: diff.renumbered,
    });
  }
  if (diff.facets.count > 0) findings.push({ kind: "formatting", ...diff.facets });
  return findings;
}

function licenseFinding(entry: CatalogEntry, pinned: Uint8Array, upstream: Uint8Array): Finding[] {
  const [before, after] = [licenseStatements(entry.format, pinned), licenseStatements(entry.format, upstream)];
  const changes = Object.keys({ ...before, ...after })
    .filter((where) => before[where] !== after[where])
    .map((where) => ({ where, before: before[where], after: after[where] }));
  return changes.length > 0 ? [{ kind: "license", changes }] : [];
}

// What the import reads from a copy of a file; undefined with a reason when
// it is not that kind of file.
function read(entry: CatalogEntry, bytes: Uint8Array): { content: unknown; checksum: string } | string {
  try {
    const content = entry.file.read(bytes);
    if (content === undefined) return `it is not ${entry.file.expected}`;
    return { content, checksum: entry.file.checksum(content) };
  } catch (error) {
    return `the import cannot read it: ${message(error)}`;
  }
}

type Copies = { changed: boolean; before: unknown; after: unknown };

export async function checkSources({
  entries,
  fetcher,
  mirror,
  config,
  previous = EMPTY_STATE,
  now = new Date(),
  log = () => {},
}: {
  // From pinnedFiles() in ../catalog.ts.
  entries: readonly CatalogEntry[];
  fetcher: Fetcher;
  // Where the pinned copies are (mirrorUrl() in the import's mirror.ts);
  // undefined for no mirror, and then a changed file cannot be classified.
  mirror: string | undefined;
  config: UpstreamCheckConfig;
  previous?: CheckState;
  now?: Date;
  log?: (message: string) => void;
}): Promise<{ results: SourceResult[]; state: CheckState }> {
  // The mirror's manifest has the checksum of each mirrored file's bytes,
  // which saves downloading a pinned copy the publisher still serves.
  let manifest: Manifest | undefined;
  if (mirror) {
    try {
      const { bytes } = await fetcher(`${mirror}/${MANIFEST_FILE}`);
      manifest = JSON.parse(new TextDecoder().decode(bytes)) as Manifest;
    } catch (error) {
      log(`The mirror's ${MANIFEST_FILE} could not be read (${message(error)}); comparing every file in full.`);
    }
  }

  const state: CheckState = { unavailable: {} };
  // Since when a source has been unavailable in this way, carried over from
  // the run before, and whether that is long enough to report.
  const lasting = (id: string, what: string) => {
    const since = previous.unavailable[id]?.since ?? now.toISOString();
    state.unavailable[id] = { since, what };
    const days = (now.getTime() - new Date(since).getTime()) / 86_400_000;
    return { since, persisted: days >= config.unreachableDays };
  };

  const results: SourceResult[] = [];
  // Both copies of a translation's two files, for comparing the pair.
  const kept = new Map<string, Copies>();
  const paired = new Set(
    entries.flatMap((entry) => {
      const source = formattedSource(entry);
      return source ? [source.id, entry.id] : [];
    }),
  );

  for (const entry of entries) {
    const { file } = entry;
    log(`${entry.id}: fetching ${file.upstreamUrl}`);
    const unavailable = (reason: string): SourceResult => ({
      entry,
      status: "unavailable",
      findings: [{ kind: "unreachable", reason, ...lasting(entry.id, reason) }],
    });

    let upstream: Awaited<ReturnType<Fetcher>>;
    try {
      upstream = await fetcher(file.upstreamUrl);
    } catch (error) {
      results.push(unavailable(error instanceof DownloadError ? error.reason : message(error)));
      continue;
    }
    const served = read(entry, upstream.bytes);
    if (typeof served === "string") {
      results.push(unavailable(`the publisher answered, but ${served}`));
      continue;
    }

    const findings: Finding[] = [];
    const to = movedTo(file.upstreamUrl, upstream.url);
    if (to) findings.push({ kind: "moved", to, ...lasting(entry.id, `moved to ${to}`) });

    const same = served.checksum === file.pin;
    const recorded = manifest?.files.find((each) => each.file === file.name)?.sha256;
    if (same && recorded === sha256(upstream.bytes)) {
      results.push({ entry, status: "identical", checksum: served.checksum, findings });
      if (paired.has(entry.id)) kept.set(entry.id, { changed: false, before: served.content, after: served.content });
      continue;
    }

    // The pinned copy, checked against the pin like any other download.
    let pinned: { bytes: Uint8Array; content: unknown } | string;
    if (!mirror || !file.mirrored) {
      pinned = "it is not in the mirror";
    } else {
      try {
        const { bytes } = await fetcher(`${mirror}/${file.name}`);
        const copy = read(entry, bytes);
        if (typeof copy === "string") pinned = `the mirror's copy could not be used: ${copy}`;
        else if (copy.checksum !== file.pin) pinned = "the mirror's copy does not match the pin";
        else pinned = { bytes, content: copy.content };
      } catch (error) {
        pinned = `the mirror's copy could not be fetched: ${message(error)}`;
      }
    }

    if (same && typeof pinned !== "string" && sha256(pinned.bytes) === sha256(upstream.bytes)) {
      results.push({ entry, status: "identical", checksum: served.checksum, findings });
      if (paired.has(entry.id)) kept.set(entry.id, { changed: false, before: served.content, after: served.content });
      continue;
    }
    if (same) {
      if (typeof pinned === "string") {
        findings.push({ kind: "rebuild", note: `Its license statements were not compared: ${pinned}.` });
      } else {
        findings.push(...licenseFinding(entry, pinned.bytes, upstream.bytes));
        findings.push({ kind: "rebuild", note: "The file's bytes differ; what the import reads from it is the same." });
      }
      results.push({ entry, status: "same-content", checksum: served.checksum, findings });
      if (paired.has(entry.id)) kept.set(entry.id, { changed: false, before: served.content, after: served.content });
      continue;
    }

    if (typeof pinned === "string") {
      findings.push({ kind: "unclassified", reason: pinned });
    } else {
      findings.push(...licenseFinding(entry, pinned.bytes, upstream.bytes));
      try {
        const [before, after] = [readUnits(entry, pinned.content), readUnits(entry, served.content)];
        const diff = diffUnits(before.units, after.units, config.examples);
        if (isEmpty(diff)) {
          findings.push({
            kind: "rebuild",
            note:
              "The checksum differs, but only in spacing or markup the import sets aside: " +
              "it would load the same content from this file.",
          });
        } else {
          findings.push(...contentFindings(after.family, diff));
        }
      } catch (error) {
        findings.push({ kind: "unreadable", reason: message(error) });
      }
      if (paired.has(entry.id)) kept.set(entry.id, { changed: true, before: pinned.content, after: served.content });
    }
    results.push({ entry, status: "changed", checksum: served.checksum, findings });
  }

  // A translation's two sources against each other, where either changed.
  for (const entry of entries) {
    const source = formattedSource(entry);
    const [text, marks] = [source && kept.get(source.id), kept.get(entry.id)];
    if (!source || !text || !marks || !(text.changed || marks.changed)) continue;
    try {
      const before = compareSources(source, text.before as HelloaoTranslation, marks.before as UsfmBook[]);
      const after = compareSources(source, text.after as HelloaoTranslation, marks.after as UsfmBook[]);
      const newly: Counted = { count: 0, labels: [] };
      for (const id of [...after.differing].sort((a, b) => a - b)) {
        if (before.differing.has(id)) continue;
        newly.count++;
        if (newly.labels.length < config.examples) newly.labels.push(formatVerseId(id));
      }
      const resolved = [...before.differing].filter((id) => !after.differing.has(id)).length;
      const finding = (other: string): Finding => ({
        kind: "divergence",
        with: other,
        before: before.differing.size,
        after: after.differing.size,
        newly,
        resolved,
        marks: source.formatting.kind === "paragraphs" ? "paragraph breaks" : "red-letter text",
        unplacedBefore: before.unplaced.size,
        unplacedAfter: after.unplaced.size,
      });
      const add = (id: string, other: string) =>
        results.find((result) => result.entry.id === id)?.findings.push(finding(other));
      if (text.changed) add(source.id, entry.id);
      if (marks.changed) add(entry.id, source.id);
    } catch (error) {
      log(`${source.id}: its two sources could not be compared: ${message(error)}`);
    }
  }

  return { results, state };
}
