import { DATA_RELEASE, DATA_RELEASE_REPOSITORY } from "@/lib/bible/import/mirror";

import type { Finding, SourceResult } from "./check";
import type { UpstreamCheckConfig } from "./config";
import type { Counted } from "./diff";

// What a run's findings come to: which are significant, what to do about a
// source, and the issue that says so.

export type Recommendation = "refresh" | "wait" | "investigate";

export const REFRESH_STEPS = `https://github.com/${DATA_RELEASE_REPOSITORY}/blob/main/README.md#refreshing-a-source`;
const CHECK_DOCS = `https://github.com/${DATA_RELEASE_REPOSITORY}/blob/main/README.md#checking-upstream-for-changes`;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export function isSignificant(finding: Finding, config: UpstreamCheckConfig): boolean {
  const above = config.significantAbove;
  switch (finding.kind) {
    case "rebuild":
      return false;
    case "wording":
      return finding.count > above.wordingVerses;
    case "numbering":
      return finding.added.count + finding.removed.count + finding.renumbered.count > above.numberingVerses;
    case "formatting":
      return finding.count > above.formattingVerses;
    case "entries":
      return (
        finding.added.count + finding.removed.count + finding.moved.count + finding.reworded.count +
          finding.markup.count >
        above.commentaryEntries
      );
    case "references":
      return (
        finding.added.count + finding.removed.count > above.crossReferencesShare * finding.before ||
        finding.crossedZero > above.crossReferencesShownShare * finding.before
      );
    case "divergence":
      return finding.newly.count > above.divergingVerses;
    case "unreachable":
    case "moved":
      return finding.persisted;
    case "license":
    case "unreadable":
    case "unclassified":
      return true;
  }
}

// The classification of a finding, as the README lists them.
const CLASSIFICATION: Record<Finding["kind"], string> = {
  rebuild: "rebuild",
  wording: "wording",
  numbering: "verses added, removed or renumbered",
  formatting: "formatting",
  entries: "entries",
  references: "cross references",
  license: "license or attribution",
  unreachable: "unreachable",
  moved: "moved",
  unreadable: "unreadable",
  unclassified: "unclassified",
  divergence: "divergence",
};

// One line for a finding: the run's log, and the heading of its section.
export function summarize(finding: Finding): string {
  switch (finding.kind) {
    case "rebuild":
      return "rebuilt, with no change to what the import reads";
    case "wording":
      return `wording changed in ${plural(finding.count, "verse")}`;
    case "numbering": {
      const parts = [
        finding.added.count > 0 && `${plural(finding.added.count, "verse")} added`,
        finding.removed.count > 0 && `${plural(finding.removed.count, "verse")} removed`,
        finding.renumbered.count > 0 && `${plural(finding.renumbered.count, "verse")} renumbered`,
      ];
      return parts.filter(Boolean).join(", ");
    }
    case "formatting":
      return `formatting changed in ${plural(finding.count, "verse")}`;
    case "entries": {
      const parts = [
        finding.added.count > 0 && `${plural(finding.added.count, "entry", "entries")} added`,
        finding.removed.count > 0 && `${plural(finding.removed.count, "entry", "entries")} removed`,
        finding.moved.count > 0 && `${plural(finding.moved.count, "entry", "entries")} moved to other verses`,
        finding.reworded.count > 0 && `${plural(finding.reworded.count, "entry", "entries")} reworded`,
        finding.markup.count > 0 && `markup changed in ${plural(finding.markup.count, "entry", "entries")}`,
      ];
      return parts.filter(Boolean).join(", ");
    }
    case "references":
      return (
        `${plural(finding.added.count, "cross reference")} added, ${finding.removed.count.toLocaleString("en-US")} removed, ` +
        `votes changed on ${finding.votes.toLocaleString("en-US")}`
      );
    case "license":
      return `license or attribution statement changed in ${plural(finding.changes.length, "place")}`;
    case "unreachable":
      return `unreachable: ${finding.reason}`;
    case "moved":
      return `moved to ${finding.to}`;
    case "unreadable":
      return "changed, and the import cannot read the new file";
    case "unclassified":
      return "changed, and could not be compared with the pinned copy";
    case "divergence":
      return (
        `differs from ${finding.with} in ${plural(finding.after, "verse")} ` +
        `(${finding.before.toLocaleString("en-US")} when pinned)`
      );
  }
}

export function recommend(findings: readonly Finding[]): { action: Recommendation; why: string } {
  const has = (kind: Finding["kind"]) => findings.some((finding) => finding.kind === kind);
  if (has("unreachable")) {
    return {
      action: "investigate",
      why: "The publisher no longer serves this file at the pinned address. Installs keep loading it from the mirror. Find out whether it has moved or been withdrawn before anything else.",
    };
  }
  if (has("moved")) {
    return {
      action: "investigate",
      why: "The pinned address redirects elsewhere. Confirm the new address is the publisher's, then update the source's `downloadUrl`.",
    };
  }
  if (has("license")) {
    return {
      action: "investigate",
      why: "What the file says about its own license or attribution changed. Read the new terms before refreshing: only public-domain or openly licensed files may be imported and mirrored, and `DATA-LICENSES.md` and the notice in `src/lib/data-release/catalog.ts` quote the old wording.",
    };
  }
  if (has("unreadable")) {
    return {
      action: "investigate",
      why: "The import's reader fails on the new file, so a refresh needs a code change first.",
    };
  }
  if (has("unclassified")) {
    return {
      action: "investigate",
      why: "The file no longer matches its pin, and this run had no pinned copy to compare it with. Run `pnpm data:check` again, or compare the files by hand.",
    };
  }
  if (has("numbering")) {
    return {
      action: "investigate",
      why: "Verses were added, removed or renumbered. Verse ids are shared by every translation and by highlights and feed items, so check each one against `src/lib/bible/versification.ts` before refreshing.",
    };
  }
  const divergence = findings.find((finding) => finding.kind === "divergence");
  if (divergence && (divergence.after > divergence.before || divergence.unplacedAfter > divergence.unplacedBefore)) {
    return {
      action: "wait",
      why:
        `This source has moved away from \`${divergence.with}\`, the same translation's other source, which leaves ` +
        `${divergence.marks} unplaced on more verses than before. Refresh once the other source has caught up, or refresh both together.`,
    };
  }
  return {
    action: "refresh",
    why: "The changes are of the kind a refresh takes in: review them, then follow the refresh steps.",
  };
}

const quote = (text: string) => `“${text}”`;

const listed = ({ count, labels }: Counted) =>
  labels.join(", ") + (count > labels.length ? `, and ${(count - labels.length).toLocaleString("en-US")} more` : "");

function details(finding: Finding): string[] {
  switch (finding.kind) {
    case "rebuild":
      return [finding.note];
    case "wording":
      return [
        ...finding.examples.map(
          (example) => `- **${example.label}**: ${quote(example.before)} became ${quote(example.after)}`,
        ),
        ...(finding.count > finding.examples.length
          ? [`- and ${(finding.count - finding.examples.length).toLocaleString("en-US")} more`]
          : []),
      ];
    case "numbering":
      return [
        `${finding.before.toLocaleString("en-US")} verses when pinned, ${finding.after.toLocaleString("en-US")} now.`,
        ...(finding.added.count > 0 ? [`- Added: ${listed(finding.added)}`] : []),
        ...(finding.removed.count > 0 ? [`- Removed: ${listed(finding.removed)}`] : []),
        ...(finding.renumbered.count > 0
          ? [
              "- Renumbered (the same words under another number): " +
                listed({
                  count: finding.renumbered.count,
                  labels: finding.renumbered.examples.map(({ from, to }) => `${from} is now ${to}`),
                }),
            ]
          : []),
      ];
    case "formatting":
      return [
        "The words of these verses are the same.",
        ...Object.entries(finding.byFacet).map(([facet, count]) => `- ${facet}: ${plural(count, "verse")}`),
        `For example: ${listed({ count: finding.count, labels: finding.labels })}.`,
      ];
    case "entries":
      return [
        `${finding.before.toLocaleString("en-US")} entries when pinned, ${finding.after.toLocaleString("en-US")} now.`,
        ...(finding.added.count > 0 ? [`- Added: ${listed(finding.added)}`] : []),
        ...(finding.removed.count > 0 ? [`- Removed: ${listed(finding.removed)}`] : []),
        ...(finding.moved.count > 0
          ? [
              "- Moved to other verses: " +
                listed({
                  count: finding.moved.count,
                  labels: finding.moved.examples.map(({ from, to }) => `${from} is now on ${to}`),
                }),
            ]
          : []),
        ...finding.reworded.examples.map(
          (example) => `- Reworded, **${example.label}**: ${quote(example.before)} became ${quote(example.after)}`,
        ),
        ...(finding.reworded.count > finding.reworded.examples.length
          ? [`- and ${(finding.reworded.count - finding.reworded.examples.length).toLocaleString("en-US")} more reworded`]
          : []),
        ...(finding.markup.count > 0 ? [`- Markup only (the words are the same): ${listed(finding.markup)}`] : []),
      ];
    case "references":
      return [
        `${finding.before.toLocaleString("en-US")} cross references when pinned, ${finding.after.toLocaleString("en-US")} now.`,
        ...(finding.added.count > 0 ? [`- Added: ${listed(finding.added)}`] : []),
        ...(finding.removed.count > 0 ? [`- Removed: ${listed(finding.removed)}`] : []),
        `- Votes changed on ${finding.votes.toLocaleString("en-US")}; ${finding.crossedZero.toLocaleString("en-US")} of them ` +
          "moved across zero, where the study panel stops showing a reference.",
      ];
    case "license":
      return finding.changes.map(({ where, before, after }) =>
        before === undefined
          ? `- \`${where}\` is new: ${quote(after!)}`
          : after === undefined
            ? `- \`${where}\` is gone. It said: ${quote(before)}`
            : `- \`${where}\`: ${quote(before)} became ${quote(after)}`,
      );
    case "unreachable":
      return [`${finding.reason}. This has been so on every run since ${finding.since.slice(0, 10)}.`];
    case "moved":
      return [`The pinned address now redirects to <${finding.to}>, and has on every run since ${finding.since.slice(0, 10)}.`];
    case "unreadable":
      return [`The import's reader stops on the new file: ${finding.reason}`];
    case "unclassified":
      return [`The publisher's file does not match the pin, and ${finding.reason}.`];
    case "divergence":
      return [
        `The same translation is also read from \`${finding.with}\`. The two differed in ` +
          `${plural(finding.before, "verse")} when pinned and differ in ${finding.after.toLocaleString("en-US")} with the publishers' files of today.`,
        ...(finding.newly.count > 0 ? [`- Newly differing: ${listed(finding.newly)}`] : []),
        ...(finding.resolved > 0 ? [`- No longer differing: ${plural(finding.resolved, "verse")}`] : []),
        `- Verses whose ${finding.marks} the import cannot place because of it: ` +
          `${finding.unplacedBefore.toLocaleString("en-US")} when pinned, ${finding.unplacedAfter.toLocaleString("en-US")} now.`,
      ];
  }
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

export type IssueDraft = {
  source: string;
  // The state of the publisher's file this was written about.
  fingerprint: string;
  title: string;
  body: string;
  recommendation: Recommendation;
  // The classifications of its significant findings, sorted.
  classifications: string[];
};

// The first line of an issue's body: what tells the check, on a later run,
// that this is the issue for a source, and what the issue said last time.
const MARKER = /<!-- selah-upstream-check (\{.*?\}) -->/;

export type Marker = {
  source: string;
  fingerprint?: string;
  recommendation?: string;
  classifications?: string[];
};

export function readMarker(body: string): Marker | undefined {
  try {
    const marker = JSON.parse(MARKER.exec(body)?.[1] ?? "") as Marker;
    return typeof marker.source === "string" ? marker : undefined;
  } catch {
    return undefined;
  }
}

const writeMarker = (marker: Marker) => `<!-- selah-upstream-check ${JSON.stringify(marker)} -->`;

// The issue for a source, or undefined when nothing it found is significant.
export function draftIssue(
  { entry, checksum, findings }: SourceResult,
  config: UpstreamCheckConfig,
  now: Date,
): IssueDraft | undefined {
  const significant = findings.filter((finding) => isSignificant(finding, config));
  if (significant.length === 0) return undefined;
  const { action, why } = recommend(significant);
  const classifications = [...new Set(significant.map((finding) => CLASSIFICATION[finding.kind]))].sort();
  const { file } = entry;
  // Without a file there is no checksum: then, since when there has been none.
  const since = findings.find((finding) => finding.kind === "unreachable")?.since;
  const fingerprint = checksum ?? `unavailable since ${since}`;

  const body = [
    writeMarker({ source: entry.id, fingerprint, recommendation: action, classifications }),
    `The upstream check found that **${entry.title}** (\`${entry.id}\`) is no longer what Selah is pinned to.`,
    [
      "| | |",
      "| :--- | :--- |",
      `| Publisher's file | <${file.upstreamUrl}> |`,
      `| Publisher's page | <${entry.sourcePage}> |`,
      `| Pinned copy | \`${file.name}\` in data release \`${DATA_RELEASE}\` |`,
      `| Pin | \`${file.pin}\` (${entry.pinnedBy}) |`,
      `| Publisher's file now | ${checksum ? `\`${checksum}\`` : "not fetched"} |`,
      `| License on record | ${entry.license} |`,
      `| Last checked | ${now.toISOString().slice(0, 10)} |`,
    ].join("\n"),
    `## Recommendation: ${action}`,
    why,
    "## Findings",
    ...findings
      // What is not significant is still said, after what is.
      .toSorted((a, b) => Number(isSignificant(b, config)) - Number(isSignificant(a, config)))
      .flatMap((finding) => [
        `### ${capitalize(summarize(finding))}` + (isSignificant(finding, config) ? "" : " (below the threshold)"),
        details(finding).join("\n"),
      ]),
    "## What to do",
    `Installs are not affected: they load the pinned copy from the mirror. To take the change in, follow [Refreshing a source](${REFRESH_STEPS}); ` +
      "a refresh is one reviewed pull request, and closing this issue from it is enough. " +
      "If the change should not be taken in, close this issue: it is not filed again until the publisher's file changes again. To put it off, leave it open.",
    `This issue was filed by the scheduled upstream check, which changes no pin, fixture or mirror. It edits this text when the source changes again. See [Checking upstream for changes](${CHECK_DOCS}).`,
  ].join("\n\n");

  return {
    source: entry.id,
    fingerprint,
    title: `Upstream ${entry.id}: ${summarize(significant[0])}` + (significant.length > 1 ? `, and ${significant.length - 1} more` : ""),
    body,
    recommendation: action,
    classifications,
  };
}

// The line a run prints for a source.
export function describeResult(result: SourceResult, config: UpstreamCheckConfig): string {
  const { status, findings } = result;
  if (findings.length === 0) return status === "identical" ? "unchanged" : status;
  return findings
    .map((finding) => summarize(finding) + (isSignificant(finding, config) ? " [significant]" : ""))
    .join("; ");
}
