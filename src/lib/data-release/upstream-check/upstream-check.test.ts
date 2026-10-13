import { describe, expect, it } from "vitest";

import { DownloadError, formattingFile, sourceFile, type PinnedFile } from "@/lib/bible/import/download";
import type { HelloaoTranslation } from "@/lib/bible/import/helloao";
import { BIBLE_SOURCES } from "@/lib/bible/import/sources";
import { zip } from "@/lib/bible/import/zip.fixture";
import { commentaryFile, crossReferencesFile } from "@/lib/study/import/download";
import type { SwordEntry } from "@/lib/study/import/sword";
import { COMMENTARY_SOURCES, CROSS_REFERENCES } from "@/lib/study/sources";

import { pinnedFiles, type CatalogEntry } from "../catalog";
import type { Gh } from "../publish";
import { checkSources, httpFetcher, type CheckState, type Fetcher, type Finding } from "./check";
import { UPSTREAM_CHECK } from "./config";
import { excerpt } from "./diff";
import { ghIssueTracker, syncIssues, type IssueTracker, type TrackedIssue } from "./issues";
import { readUnits } from "./read";
import { draftIssue, readMarker, recommend } from "./report";

// Nothing here touches the network or GitHub: the publishers and the mirror
// are a map of URLs to bytes, and the issue tracker a list in memory.

const MIRROR = "https://mirror.test/data-v9";
const NOW = new Date("2026-10-13T06:00:00Z");
const config = UPSTREAM_CHECK;

const encode = (text: string) => new TextEncoder().encode(text);

// A catalog entry for `bytes`, pinned to what the import reads from them.
function pinnedTo(
  entry: Omit<CatalogEntry, "file" | "pinnedBy" | "notice">,
  file: (pin: string) => PinnedFile<unknown>,
  bytes: Uint8Array,
): CatalogEntry {
  const unpinned = file("0".repeat(64));
  const pin = unpinned.checksum(unpinned.read(bytes));
  return { ...entry, file: file(pin), pinnedBy: "the test", notice: "A notice." };
}

// --- A translation, in the Free Use Bible API's JSON ---

type Chapter = HelloaoTranslation["books"][number]["chapters"][number]["chapter"];
type Item = Chapter["content"][number];

const verse = (number: number, ...content: Extract<Item, { type: "verse" }>["content"]): Item => ({
  type: "verse",
  number,
  content,
});

const PSALM_23 = [
  "The LORD is my shepherd; I shall not want.",
  "He makes me lie down in green pastures; He leads me beside quiet waters.",
  "He restores my soul; He guides me in the paths of righteousness for the sake of His name.",
  "Even though I walk through the valley of the shadow of death, I will fear no evil, for You are with me.",
  "You prepare a table before me in the presence of my enemies. You anoint my head with oil; my cup overflows.",
  "Surely goodness and mercy will follow me all the days of my life, and I will dwell in the house of the LORD forever.",
];
const JOHN_3_16 = "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.";
const JOHN_3_17 = "For God did not send His Son into the world to condemn the world, but to save the world through Him.";

const LICENSE = { attribution: "not-required", publicDomain: true };

function translation({
  psalm = PSALM_23.map((text, i) => verse(i + 1, text)),
  john = [verse(16, JOHN_3_16), verse(17, JOHN_3_17)],
  footnotes = [] as Chapter["footnotes"],
  meta = {} as Record<string, unknown>,
} = {}) {
  return {
    translation: { id: "BSB", name: "Berean Standard Bible", license: LICENSE, ...meta },
    books: [
      { id: "PSA", chapters: [{ chapter: { number: 23, content: psalm, footnotes } }] },
      { id: "JHN", chapters: [{ chapter: { number: 3, content: john, footnotes: [] } }] },
    ],
  };
}

const json = (value: unknown, space?: number) => encode(JSON.stringify(value, null, space));

const bsbSource = BIBLE_SOURCES.find((source) => source.id === "bsb")!;
const BSB_URL = "https://publisher.test/bsb.json";
const BSB = json(translation());

const bsb = (bytes = BSB) =>
  pinnedTo(
    {
      id: "bsb",
      title: "Berean Standard Bible (BSB): text, headings and footnotes",
      format: "helloao-json",
      sourcePage: "https://publisher.test/",
      license: "Public domain",
      attribution: "Berean Standard Bible",
    },
    (pin) => sourceFile({ ...bsbSource, downloadUrl: BSB_URL, contentSha256: pin }) as PinnedFile<unknown>,
    bytes,
  );

// --- Its second source: the publisher's USFM, read for red-letter text ---

const usfm = (john316 = JOHN_3_16) =>
  zip({
    "43JHNBSB.usfm": `\\id JHN\n\\c 3\n\\p\n\\v 16 \\wj ${john316}\\wj*\n\\v 17 \\wj ${JOHN_3_17}\\wj*\n`,
  });
const USFM_URL = "https://publisher.test/bsb_usfm.zip";

const bsbFormatting = (bytes = usfm()) =>
  pinnedTo(
    {
      id: "bsb-formatting",
      title: "Berean Standard Bible (BSB): the publisher's USFM, read for red-letter text",
      format: "usfm-zip",
      sourcePage: "https://publisher.test/",
      license: "Public domain",
      attribution: "Berean Standard Bible",
    },
    (pin) =>
      formattingFile({
        ...bsbSource,
        formatting: { ...bsbSource.formatting!, downloadUrl: USFM_URL, contentSha256: pin },
      }) as PinnedFile<unknown>,
    bytes,
  );

// --- Cross references ---

const tsv = (rows: string[], header = "#www.openbible.info CC-BY 2026-10-12") =>
  zip({ "cross_references.txt": `From Verse\tTo Verse\tVotes\t${header}\n${rows.join("\n")}\n` });
// A hundred references from John 3:16, so that a share of them means something.
const REFERENCES = Array.from({ length: 100 }, (_, i) => `John.3.16\tPs.119.${i + 1}\t${i + 1}`);
const REFERENCES_URL = "https://publisher.test/cross-references.zip";

const crossReferences = (bytes = tsv(REFERENCES)) =>
  pinnedTo(
    {
      id: "cross-references",
      title: "OpenBible.info cross references",
      format: "openbible-zip",
      sourcePage: "https://publisher.test/",
      license: "CC BY 4.0",
      attribution: "Cross references from OpenBible.info",
    },
    (pin) => crossReferencesFile({ ...CROSS_REFERENCES, downloadUrl: REFERENCES_URL, contentSha256: pin }) as PinnedFile<unknown>,
    bytes,
  );

// --- Study notes ---

const note = (name: string, text: string) =>
  `<item name="${name}" typename="StudyNote" product="TyndaleOpenStudyNotes">\n<refs>${name}</refs>\n<body><p class="sn-text">${text}</p></body>\n</item>`;
const NOTES = [note("John.3.16", "God loved the world."), note("John.3.17", "He came to save.")];
const README = "Licensed under the Creative Commons Attribution-ShareAlike 4.0 International License.";
const notes = (items = NOTES, readme = README) =>
  zip({
    "Tyndale Open Study Notes/_README.txt": readme,
    "Tyndale Open Study Notes/StudyNotes.xml": `<items release="1.25">\n${items.join("\n")}\n</items>`,
  });
const tyndaleSource = COMMENTARY_SOURCES.find((source) => source.id === "tyndale")!;
const NOTES_URL = "https://publisher.test/notes.zip";

const tyndale = (bytes = notes()) =>
  pinnedTo(
    {
      id: "tyndale",
      title: "Tyndale Open Study Notes",
      format: "tyndale-zip",
      sourcePage: "https://publisher.test/",
      license: "CC BY-SA 4.0",
      attribution: "Tyndale Open Study Notes",
    },
    (pin) => commentaryFile({ ...tyndaleSource, downloadUrl: NOTES_URL, contentSha256: pin }),
    bytes,
  );

// --- The publishers and the mirror ---

type Served = Uint8Array | Error | { bytes: Uint8Array; url: string };

// Serves each entry's pinned bytes from the mirror, and `upstream` from the
// publishers.
function web(pinned: [CatalogEntry, Uint8Array][], upstream: Record<string, Served>): Fetcher & { asked: string[] } {
  const asked: string[] = [];
  const mirror = new Map(pinned.map(([entry, bytes]) => [`${MIRROR}/${entry.file.name}`, bytes]));
  const fetcher: Fetcher = async (url) => {
    asked.push(url);
    const served = upstream[url] ?? mirror.get(url);
    if (!served) throw new DownloadError(url, "HTTP 404");
    if (served instanceof Error) throw served;
    return served instanceof Uint8Array ? { bytes: served, url } : served;
  };
  return Object.assign(fetcher, { asked });
}

// Checks one source whose publisher now serves `upstream`.
async function check(entry: CatalogEntry, pinned: Uint8Array, upstream: Served, previous?: CheckState, now = NOW) {
  const { results, state } = await checkSources({
    entries: [entry],
    fetcher: web([[entry, pinned]], { [entry.file.upstreamUrl]: upstream }),
    mirror: MIRROR,
    config,
    previous,
    now,
  });
  return { result: results[0], state, issue: draftIssue(results[0], config, now) };
}

const kinds = (findings: readonly Finding[]) => findings.map((finding) => finding.kind);
const found = <K extends Finding["kind"]>(findings: readonly Finding[], kind: K) =>
  findings.find((finding): finding is Extract<Finding, { kind: K }> => finding.kind === kind)!;

describe("a source that has not changed", () => {
  it("files nothing when the publisher serves the pinned bytes", async () => {
    const { result, issue, state } = await check(bsb(), BSB, BSB);
    expect(result).toMatchObject({ status: "identical", findings: [] });
    expect(issue).toBeUndefined();
    expect(state.unavailable).toEqual({});
  });

  it("does not download the pinned copy when the manifest says the bytes are the same", async () => {
    const entry = tyndale();
    const { createHash } = await import("node:crypto");
    const manifest = { files: [{ file: entry.file.name, sha256: createHash("sha256").update(notes()).digest("hex") }] };
    const fetcher = web([[entry, notes()]], {
      [`${MIRROR}/MANIFEST.json`]: json(manifest),
      [NOTES_URL]: notes(),
    });
    const { results } = await checkSources({ entries: [entry], fetcher, mirror: MIRROR, config });
    expect(results[0].status).toBe("identical");
    expect(fetcher.asked).toEqual([`${MIRROR}/MANIFEST.json`, NOTES_URL]);
  });

  it("files nothing for a rebuild that changes only metadata around the text", async () => {
    const rebuilt = json(translation({ meta: { sha256: "another build", numberOfBooks: 66 } }), 2);
    const { result, issue } = await check(bsb(), BSB, rebuilt);
    expect(result.status).toBe("same-content");
    expect(kinds(result.findings)).toEqual(["rebuild"]);
    expect(issue).toBeUndefined();
  });

  it("files nothing for a rebuild that changes only whitespace the import sets aside", async () => {
    // The pin is over the raw content, so it no longer matches; the verses
    // the import would load are the same.
    const spaced = json(translation({ john: [verse(16, `${JOHN_3_16}  `), verse(17, ` ${JOHN_3_17}`)] }));
    const { result, issue } = await check(bsb(), BSB, spaced);
    expect(result.status).toBe("changed");
    expect(result.checksum).not.toBe(bsb().file.pin);
    expect(kinds(result.findings)).toEqual(["rebuild"]);
    expect(issue).toBeUndefined();
  });

  it("files nothing for cross references rebuilt with a new date", async () => {
    const { result, issue } = await check(
      crossReferences(),
      tsv(REFERENCES),
      tsv(REFERENCES, "#www.openbible.info CC-BY 2026-10-19"),
    );
    expect(kinds(result.findings)).toEqual(["rebuild"]);
    expect(issue).toBeUndefined();
  });
});

describe("a translation that changed", () => {
  it("reports wording changes with how many verses and examples", async () => {
    const reworded = json(
      translation({
        john: [verse(16, JOHN_3_16.replace("so loved", "so greatly loved")), verse(17, JOHN_3_17.replace("condemn", "judge"))],
      }),
    );
    const { result, issue } = await check(bsb(), BSB, reworded);
    expect(kinds(result.findings)).toEqual(["wording"]);
    expect(found(result.findings, "wording")).toMatchObject({
      count: 2,
      examples: [
        { label: "John 3:16", before: expect.stringContaining("so loved"), after: expect.stringContaining("so greatly loved") },
        { label: "John 3:17" },
      ],
    });
    expect(issue).toMatchObject({ recommendation: "refresh", classifications: ["wording"] });
    expect(issue!.title).toBe("Upstream bsb: wording changed in 2 verses");
    expect(issue!.body).toContain("## Recommendation: refresh");
    expect(issue!.body).toContain("### Wording changed in 2 verses");
    expect(issue!.body).toContain("- **John 3:16**: “For God so loved the world");
    expect(issue!.body).toContain("became “For God so greatly loved the world");
    expect(issue!.body).toContain("README.md#refreshing-a-source");
    expect(issue!.body).toContain(`| Publisher's file | <${BSB_URL}> |`);
    expect(readMarker(issue!.body)).toEqual({
      source: "bsb",
      fingerprint: result.checksum,
      recommendation: "refresh",
      classifications: ["wording"],
    });
  });

  it("reports verses added, removed and renumbered, and recommends investigating", async () => {
    const renumbered = json(
      translation({
        // Psalm 23:6 is gone, John 3:17 is numbered 18, and there is a new verse.
        psalm: PSALM_23.slice(0, 5).map((text, i) => verse(i + 1, text)),
        john: [verse(16, JOHN_3_16), verse(18, JOHN_3_17), verse(19, "And this is the verdict.")],
      }),
    );
    const { result, issue } = await check(bsb(), BSB, renumbered);
    expect(kinds(result.findings)).toEqual(["numbering"]);
    expect(found(result.findings, "numbering")).toMatchObject({
      before: 8,
      after: 8,
      added: { count: 1, labels: ["John 3:19"] },
      removed: { count: 1, labels: ["Psalms 23:6"] },
      renumbered: { count: 1, examples: [{ from: "John 3:17", to: "John 3:18" }] },
    });
    expect(issue).toMatchObject({
      recommendation: "investigate",
      classifications: ["verses added, removed or renumbered"],
      title: "Upstream bsb: 1 verse added, 1 verse removed, 1 verse renumbered",
    });
    expect(issue!.body).toContain("- Added: John 3:19");
    expect(issue!.body).toContain("- Removed: Psalms 23:6");
    expect(issue!.body).toContain("John 3:17 is now John 3:18");
  });

  it("does not file for a handful of formatting changes", async () => {
    const formatted = json(
      translation({
        john: [
          { type: "heading", content: ["God So Loved"] },
          verse(16, { text: JOHN_3_16, wordsOfJesus: true }),
          { type: "line_break" },
          verse(17, JOHN_3_17),
        ],
      }),
    );
    const { result, issue } = await check(bsb(), BSB, formatted);
    expect(kinds(result.findings)).toEqual(["formatting"]);
    expect(found(result.findings, "formatting")).toMatchObject({
      count: 2,
      byFacet: { headings: 1, "red-letter spans": 1, "paragraph and line breaks": 1 },
    });
    expect(issue).toBeUndefined();
  });

  it("files when more than a handful of verses change formatting", async () => {
    const formatted = json(
      translation({
        psalm: PSALM_23.flatMap((text, i): Item[] => [{ type: "line_break" }, verse(i + 1, text, { noteId: i })]),
        footnotes: PSALM_23.map((_, noteId) => ({ noteId, text: "Or a note" })),
      }),
    );
    const { result, issue } = await check(bsb(), BSB, formatted);
    expect(found(result.findings, "formatting")).toMatchObject({
      count: 6,
      byFacet: { footnotes: 6, "paragraph and line breaks": 6 },
    });
    expect(issue).toMatchObject({ recommendation: "refresh", classifications: ["formatting"] });
    expect(issue!.body).toContain("### Formatting changed in 6 verses");
    expect(issue!.body).toContain("- footnotes: 6 verses");
    expect(issue!.body).toContain("For example: Psalms 23:1, Psalms 23:2, Psalms 23:3, and 3 more.");
  });

  it("reports a change in what the file says about its license, even when the text is the same", async () => {
    const relicensed = json(translation({ meta: { license: { ...LICENSE, publicDomain: false } } }));
    const { result, issue } = await check(bsb(), BSB, relicensed);
    expect(result.status).toBe("same-content");
    expect(kinds(result.findings)).toEqual(["license", "rebuild"]);
    expect(issue).toMatchObject({ recommendation: "investigate", classifications: ["license or attribution"] });
    expect(issue!.body).toContain("`translation.license`");
    expect(issue!.body).toContain('"publicDomain":false');
    expect(issue!.body).toContain("DATA-LICENSES.md");
  });

  it("says so when the import cannot read the new file", async () => {
    // Two verses with the same number: the import refuses the chapter.
    const broken = json(translation({ john: [verse(16, JOHN_3_16), verse(16, JOHN_3_17)] }));
    const { result, issue } = await check(bsb(), BSB, broken);
    expect(found(result.findings, "unreadable").reason).toMatch(/already used/);
    expect(issue).toMatchObject({ recommendation: "investigate", classifications: ["unreadable"] });
  });

  it("says so when there is no pinned copy to compare with", async () => {
    const entry = bsb();
    const { results } = await checkSources({
      entries: [entry],
      fetcher: web([], { [BSB_URL]: json(translation({ john: [verse(16, "Changed.")] })) }),
      mirror: MIRROR,
      config,
    });
    expect(kinds(results[0].findings)).toEqual(["unclassified"]);
    expect(draftIssue(results[0], config, NOW)).toMatchObject({ recommendation: "investigate" });
  });
});

describe("a translation's two sources", () => {
  const pair = () => [bsb(), bsbFormatting()] as const;
  const run = (upstream: Record<string, Served>) => {
    const [text, marks] = pair();
    return checkSources({
      entries: [text, marks],
      fetcher: web([[text, BSB], [marks, usfm()]], { [BSB_URL]: BSB, [USFM_URL]: usfm(), ...upstream }),
      mirror: MIRROR,
      config,
    });
  };

  it("reports nothing about them when neither changed", async () => {
    const { results } = await run({});
    expect(results.map((result) => result.findings)).toEqual([[], []]);
  });

  it("reports a divergence when one moves away from the other, and recommends waiting", async () => {
    const reworded = JOHN_3_16.replace("so loved", "so greatly loved");
    const { results } = await run({ [USFM_URL]: usfm(reworded) });
    const [text, marks] = results;
    expect(text.findings).toEqual([]);
    expect(kinds(marks.findings)).toEqual(["wording", "divergence"]);
    expect(found(marks.findings, "divergence")).toMatchObject({
      with: "bsb",
      before: 6, // Psalm 23, which the USFM fixture leaves out
      after: 7,
      newly: { count: 1, labels: ["John 3:16"] },
      resolved: 0,
      marks: "red-letter text",
      unplacedBefore: 0,
      unplacedAfter: 1,
    });
    const issue = draftIssue(marks, config, NOW)!;
    expect(issue).toMatchObject({ recommendation: "wait", classifications: ["divergence", "wording"] });
    expect(issue.body).toContain("## Recommendation: wait");
    expect(issue.body).toContain("- Newly differing: John 3:16");
    expect(issue.body).toContain("0 when pinned, 1 now");
  });

  it("recommends a refresh when both have changed the same way", async () => {
    const reworded = JOHN_3_16.replace("so loved", "so greatly loved");
    const { results } = await run({
      [BSB_URL]: json(translation({ john: [verse(16, reworded), verse(17, JOHN_3_17)] })),
      [USFM_URL]: usfm(reworded),
    });
    for (const result of results) {
      expect(kinds(result.findings)).toEqual(["wording", "divergence"]);
      expect(found(result.findings, "divergence")).toMatchObject({ before: 6, after: 6, newly: { count: 0 } });
      expect(draftIssue(result, config, NOW)).toMatchObject({ recommendation: "refresh", classifications: ["wording"] });
    }
  });
});

describe("the study sources", () => {
  it("does not file for the cross references that come and go every week", async () => {
    const drifted = [...REFERENCES, "John.3.16\tRom.5.8\t12"].map((row) => row.replace(/\t50$/, "\t51"));
    const { result, issue } = await check(crossReferences(), tsv(REFERENCES), tsv(drifted));
    expect(found(result.findings, "references")).toMatchObject({
      before: 100,
      after: 101,
      added: { count: 1, labels: ["John 3:16 to Romans 5:8"] },
      removed: { count: 0 },
      votes: 1,
      crossedZero: 0,
    });
    expect(issue).toBeUndefined();
  });

  it("files when more than the configured share of cross references is added or removed", async () => {
    const { result, issue } = await check(crossReferences(), tsv(REFERENCES), tsv(REFERENCES.slice(3)));
    expect(found(result.findings, "references")).toMatchObject({ removed: { count: 3 }, after: 97 });
    expect(issue).toMatchObject({ recommendation: "refresh", classifications: ["cross references"] });
    expect(issue!.title).toBe("Upstream cross-references: 0 cross references added, 3 removed, votes changed on 0");
    expect(issue!.body).toContain("100 cross references when pinned, 97 now.");
  });

  it("files when many cross references are voted across zero", async () => {
    const hidden = REFERENCES.map((row, i) => (i < 2 ? row.replace(/\t\d+$/, "\t-4") : row));
    const { result, issue } = await check(crossReferences(), tsv(REFERENCES), tsv(hidden));
    expect(found(result.findings, "references")).toMatchObject({ votes: 2, crossedZero: 2 });
    expect(issue).toBeDefined();
  });

  it("reports a license change in the cross references' header", async () => {
    const { issue } = await check(
      crossReferences(),
      tsv(REFERENCES),
      tsv(REFERENCES, "#www.openbible.info CC-BY-NC 2026-10-19"),
    );
    expect(issue).toMatchObject({ recommendation: "investigate", classifications: ["license or attribution"] });
    expect(issue!.body).toContain("“#www.openbible.info CC-BY” became “#www.openbible.info CC-BY-NC”");
  });

  it("reports study notes added, removed, moved and reworded", async () => {
    const changed = notes([
      note("John.3.16", "God loved the whole world."),
      note("John.3.17-18", "He came to save."),
      note("John.3.19", "The light has come."),
    ]);
    const { result, issue } = await check(tyndale(), notes(), changed);
    expect(found(result.findings, "entries")).toMatchObject({
      before: 2,
      after: 3,
      added: { count: 1, labels: ["John 3:19"] },
      removed: { count: 0 },
      moved: { count: 1, examples: [{ from: "John 3:17", to: "John 3:17-18" }] },
      reworded: { count: 1, examples: [{ label: "John 3:16" }] },
    });
    expect(issue).toMatchObject({ recommendation: "refresh", classifications: ["entries"] });
    expect(issue!.body).toContain("2 entries when pinned, 3 now.");
    expect(issue!.body).toContain("- Moved to other verses: John 3:17 is now on John 3:17-18");
    expect(issue!.body).toContain("- Reworded, **John 3:16**: “God loved the world.” became “God loved the whole world.”");
  });

  it("reports a change to the study notes' license file", async () => {
    const { result, issue } = await check(tyndale(), notes(), notes(NOTES, "All rights reserved."));
    expect(result.status).toBe("same-content");
    expect(issue).toMatchObject({ recommendation: "investigate" });
    expect(issue!.body).toContain("_README.txt");
  });

  it("reads a SWORD module's entries through the import's own reader", () => {
    const entry = pinnedFiles().find((each) => each.id === "matthew-henry")!;
    const entries: SwordEntry[] = [
      { kind: "verses", book: 43, chapter: 3, verseStart: 43003016, verseEnd: 43003021, osis: "<p>The love of God.</p>" },
    ];
    expect(readUnits(entry, entries)).toEqual({
      family: "entries",
      units: [
        { key: "43003016-43003021", label: "John 3:16-21", text: "The love of God.", facets: { markup: "<p>The love of God.</p>" } },
      ],
    });
  });
});

describe("a source that cannot be fetched", () => {
  const down = new DownloadError(BSB_URL, "HTTP 503");

  it("files nothing the first time, and remembers since when", async () => {
    const { result, issue, state } = await check(bsb(), BSB, down);
    expect(result.status).toBe("unavailable");
    expect(result.findings).toEqual([
      { kind: "unreachable", reason: "HTTP 503", since: NOW.toISOString(), persisted: false },
    ]);
    expect(issue).toBeUndefined();
    expect(state.unavailable).toEqual({ bsb: { since: NOW.toISOString(), what: "HTTP 503" } });
  });

  it("files once it has been unreachable on a second weekly run", async () => {
    const first = await check(bsb(), BSB, down);
    const nextDay = await check(bsb(), BSB, down, first.state, new Date("2026-10-14T06:00:00Z"));
    expect(nextDay.issue).toBeUndefined();
    expect(nextDay.state).toEqual(first.state);

    const nextWeek = new Date("2026-10-20T06:00:00Z");
    const { issue } = await check(bsb(), BSB, down, nextDay.state, nextWeek);
    expect(issue).toMatchObject({
      title: "Upstream bsb: unreachable: HTTP 503",
      recommendation: "investigate",
      classifications: ["unreachable"],
      fingerprint: `unavailable since ${NOW.toISOString()}`,
    });
    expect(issue!.body).toContain("HTTP 503. This has been so on every run since 2026-10-13.");
    expect(issue!.body).toContain("| Publisher's file now | not fetched |");
  });

  it("starts over once the source has answered", async () => {
    const first = await check(bsb(), BSB, down);
    const recovered = await check(bsb(), BSB, BSB, first.state, new Date("2026-10-20T06:00:00Z"));
    expect(recovered.state.unavailable).toEqual({});
    const again = await check(bsb(), BSB, down, recovered.state, new Date("2026-10-27T06:00:00Z"));
    expect(again.issue).toBeUndefined();
  });

  it("treats an answer that is not the file as unreachable", async () => {
    const { result } = await check(bsb(), BSB, encode("<html>Maintenance</html>"));
    expect(found(result.findings, "unreachable").reason).toBe(
      "the publisher answered, but it is not a Bible translation in JSON",
    );
  });

  it("reports an address that redirects elsewhere, once it lasts", async () => {
    const moved = { bytes: BSB, url: "https://elsewhere.test/bsb.json" };
    const first = await check(bsb(), BSB, moved);
    expect(kinds(first.result.findings)).toEqual(["moved"]);
    expect(first.issue).toBeUndefined();
    const { issue } = await check(bsb(), BSB, moved, first.state, new Date("2026-10-20T06:00:00Z"));
    expect(issue).toMatchObject({ recommendation: "investigate", classifications: ["moved"] });
    expect(issue!.body).toContain("<https://elsewhere.test/bsb.json>");
  });

  it("does not take a redirect to the same file for a move", async () => {
    const { result } = await check(bsb(), BSB, { bytes: BSB, url: `${BSB_URL}?signature=abc` });
    expect(result.findings).toEqual([]);
  });
});

describe("httpFetcher", () => {
  const response = (status: number, body = "", url = "") =>
    Object.defineProperty(new Response(body, { status }), "url", { value: url });

  it("returns the bytes and the address that served them", async () => {
    const fetcher = httpFetcher({ fetchImpl: async () => response(200, "text", "https://cdn.test/file") });
    const { bytes, url } = await fetcher("https://publisher.test/file");
    expect(new TextDecoder().decode(bytes)).toBe("text");
    expect(url).toBe("https://cdn.test/file");
  });

  it("asks again after a server error, and not after a 404", async () => {
    const answers = [response(503), response(200, "ok")];
    let asked = 0;
    const flaky = httpFetcher({ fetchImpl: async () => answers[asked++], pauseMs: 0 });
    expect(new TextDecoder().decode((await flaky("https://publisher.test/file")).bytes)).toBe("ok");

    asked = 0;
    const gone = httpFetcher({ fetchImpl: async () => (asked++, response(404)), pauseMs: 0 });
    await expect(gone("https://publisher.test/file")).rejects.toMatchObject({ reason: "HTTP 404" });
    expect(asked).toBe(1);
  });

  it("gives up on a host that never answers", async () => {
    let asked = 0;
    const fetcher = httpFetcher({
      fetchImpl: async () => {
        asked++;
        throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND publisher.test") });
      },
      pauseMs: 0,
    });
    await expect(fetcher("https://publisher.test/file")).rejects.toMatchObject({
      reason: "the host could not be reached: getaddrinfo ENOTFOUND publisher.test",
    });
    expect(asked).toBe(3);
  });
});

describe("filing issues", () => {
  // An issue tracker in memory, with everything that was done to it.
  function tracker(issues: TrackedIssue[] = []) {
    const calls: string[] = [];
    const labels: string[] = [];
    const comments: { number: number; body: string }[] = [];
    const api: IssueTracker = {
      list: async (label) => (calls.push(`list ${label}`), [...issues].sort((a, b) => b.number - a.number)),
      ensureLabel: async ({ name }) => void (calls.push(`label ${name}`), labels.push(name)),
      create: async ({ title, body, label }) => {
        const number = 100 + issues.length;
        calls.push(`create #${number} [${label}]`);
        issues.push({ number, title, body, state: "open", url: `https://github.test/issues/${number}` });
        return { number, url: `https://github.test/issues/${number}` };
      },
      edit: async (number, { title, body }) => {
        calls.push(`edit #${number}`);
        Object.assign(issues.find((issue) => issue.number === number)!, { title, body });
      },
      comment: async (number, body) => void (calls.push(`comment #${number}`), comments.push({ number, body })),
      close: async (number, body) => {
        calls.push(`close #${number}`);
        comments.push({ number, body });
        issues.find((issue) => issue.number === number)!.state = "closed";
      },
    };
    return { api, issues, calls, comments };
  }

  const reword = (word: string) =>
    check(bsb(), BSB, json(translation({ john: [verse(16, JOHN_3_16.replace("loved", word)), verse(17, JOHN_3_17)] })));
  const sync = (github: ReturnType<typeof tracker>, results: Parameters<typeof syncIssues>[0]["results"], dryRun = false) =>
    syncIssues({ results, tracker: github.api, config, now: NOW, dryRun });

  it("files one labelled issue for a significant change, and none for the rest", async () => {
    const github = tracker();
    const unchanged = await check(tyndale(), notes(), notes());
    const actions = await sync(github, [(await reword("cherished")).result, unchanged.result]);
    expect(github.calls).toEqual(["list upstream-refresh", "label upstream-refresh", "create #100 [upstream-refresh]"]);
    expect(actions).toMatchObject([{ action: "file", number: 100, draft: { source: "bsb" } }]);
    expect(github.issues[0].title).toBe("Upstream bsb: wording changed in 1 verse");
  });

  it("updates the open issue on a second run instead of filing a duplicate", async () => {
    const github = tracker();
    const { result } = await reword("cherished");
    await sync(github, [result]);
    // Someone retitles it: the issue is still found, by its marker.
    github.issues[0].title = "Refresh the BSB";
    github.calls.length = 0;

    const actions = await sync(github, [result]);
    expect(github.calls).toEqual(["list upstream-refresh", "edit #100"]);
    expect(actions).toMatchObject([{ action: "update", number: 100, comment: undefined }]);
    expect(github.issues).toHaveLength(1);
  });

  it("rewrites the open issue and comments when the source changes in a new way", async () => {
    const github = tracker();
    await sync(github, [(await reword("cherished")).result]);
    const worse = await check(bsb(), BSB, json(translation({ john: [verse(16, JOHN_3_16.replace("loved", "cherished"))] })));
    github.calls.length = 0;

    await sync(github, [worse.result]);
    expect(github.calls).toEqual(["list upstream-refresh", "edit #100", "comment #100"]);
    expect(github.issues).toHaveLength(1);
    expect(github.issues[0].body).toContain("## Recommendation: investigate");
    expect(github.issues[0].body).toContain("- Removed: John 3:17");
    expect(github.comments[0].body).toContain(
      "It is now classified as: verses added, removed or renumbered; wording. Recommendation: **investigate**.",
    );
  });

  it("is not misled by another issue with the label, or by one without the marker's source", async () => {
    const github = tracker([
      { number: 7, title: "Upstream bsb: by hand", body: "Written by a person.", state: "open", url: "" },
      { number: 8, title: "Other", body: '<!-- selah-upstream-check {"source":"kjv"} -->', state: "open", url: "" },
    ]);
    await sync(github, [(await reword("cherished")).result]);
    expect(github.calls.at(-1)).toBe("create #102 [upstream-refresh]");
  });

  it("does not file again for a change whose issue was closed", async () => {
    const github = tracker();
    const { result } = await reword("cherished");
    await sync(github, [result]);
    github.issues[0].state = "closed";
    github.calls.length = 0;

    const actions = await sync(github, [result]);
    expect(github.calls).toEqual(["list upstream-refresh"]);
    expect(actions).toMatchObject([{ action: "leave", source: "bsb", number: 100 }]);

    // The publisher changes the file again: that is a new issue.
    await sync(github, [(await reword("treasured")).result]);
    expect(github.issues.map((issue) => issue.state)).toEqual(["closed", "open"]);
  });

  it("closes the open issue once the source matches its pin again", async () => {
    const github = tracker();
    await sync(github, [(await reword("cherished")).result]);
    const actions = await sync(github, [(await check(bsb(), BSB, BSB)).result]);
    expect(actions).toMatchObject([{ action: "close", number: 100 }]);
    expect(github.issues[0].state).toBe("closed");
    expect(github.comments.at(-1)!.body).toContain("found nothing significant in `bsb` any more");
  });

  it("leaves the open issue alone while the source cannot be fetched", async () => {
    const github = tracker();
    await sync(github, [(await reword("cherished")).result]);
    github.calls.length = 0;
    await sync(github, [(await check(bsb(), BSB, new DownloadError(BSB_URL, "HTTP 503"))).result]);
    expect(github.calls).toEqual(["list upstream-refresh"]);
  });

  it("changes nothing on a dry run, and says what it would do", async () => {
    const github = tracker();
    const { result } = await reword("cherished");
    const actions = await sync(github, [result], true);
    expect(github.calls).toEqual(["list upstream-refresh"]);
    expect(actions).toMatchObject([{ action: "file", draft: { title: "Upstream bsb: wording changed in 1 verse" } }]);
    expect(actions[0]).not.toHaveProperty("number");
  });

  it("drives the gh CLI", async () => {
    const ran: string[][] = [];
    const gh: Gh = async (args) => {
      ran.push(args);
      if (args[0] === "label") return { code: 1, stdout: "", stderr: 'label with name "upstream-refresh" already exists' };
      if (args[1] === "list") {
        return { code: 0, stdout: JSON.stringify([{ number: 3, title: "t", body: "b", state: "OPEN", url: "u" }]), stderr: "" };
      }
      if (args[1] === "create") return { code: 0, stdout: "https://github.com/o/r/issues/41\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const github = ghIssueTracker(gh, "o/r");
    expect(await github.list("upstream-refresh")).toEqual([{ number: 3, title: "t", body: "b", state: "open", url: "u" }]);
    await github.ensureLabel(config.label);
    expect(await github.create({ title: "T", body: "B", label: "upstream-refresh" })).toEqual({
      number: 41,
      url: "https://github.com/o/r/issues/41",
    });
    await github.edit(41, { title: "T2", body: "B2" });
    await github.comment(41, "C");
    await github.close(41, "Done");
    expect(ran.map((args) => args.join(" "))).toEqual([
      "issue list --label upstream-refresh --state all --limit 500 --json number,title,body,state,url --repo o/r",
      `label create upstream-refresh --color ${config.label.color} --description ${config.label.description} --repo o/r`,
      "issue create --title T --body B --label upstream-refresh --repo o/r",
      "issue edit 41 --title T2 --body B2 --repo o/r",
      "issue comment 41 --body C --repo o/r",
      "issue close 41 --comment Done --repo o/r",
    ]);

    const failing = ghIssueTracker(async () => ({ code: 1, stdout: "", stderr: "HTTP 403" }), "o/r");
    await expect(failing.comment(1, "C")).rejects.toThrow("gh issue comment failed:\nHTTP 403");
  });
});

describe("the real catalog", () => {
  it("has a reader for every pinned file", () => {
    for (const entry of pinnedFiles()) {
      // An empty file of each kind: the reader is found, whatever it makes of it.
      const empty = entry.format === "helloao-json" ? { books: [] } : entry.format === "openbible-zip" ? { rows: [] } : [];
      expect(readUnits(entry, empty).units, entry.id).toEqual([]);
    }
  });
});

describe("recommend", () => {
  it("puts a question about the source before a refresh", () => {
    const wording: Finding = { kind: "wording", count: 1, examples: [] };
    expect(recommend([wording]).action).toBe("refresh");
    expect(recommend([wording, { kind: "license", changes: [] }]).action).toBe("investigate");
    expect(recommend([wording, { kind: "unreadable", reason: "" }]).action).toBe("investigate");
  });
});

describe("excerpt", () => {
  it("cuts both texts down to where they differ, on word boundaries", () => {
    const long = (word: string) => `${"In the beginning ".repeat(6)}God ${word} the heavens${" and the earth".repeat(6)}.`;
    expect(excerpt(long("created"), long("made"))).toEqual({
      before: "…beginning In the beginning In the beginning God created the heavens and the earth and the earth…",
      after: "…beginning In the beginning In the beginning God made the heavens and the earth and the earth…",
    });
    expect(excerpt("Short.", "Shorter.")).toEqual({ before: "Short.", after: "Shorter." });
  });
});
