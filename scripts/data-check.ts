import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DATA_RELEASE_REPOSITORY, mirrorUrl } from "../src/lib/bible/import/mirror";
import { pinnedFiles } from "../src/lib/data-release/catalog";
import {
  checkSources,
  EMPTY_STATE,
  httpFetcher,
  type CheckState,
} from "../src/lib/data-release/upstream-check/check";
import { UPSTREAM_CHECK } from "../src/lib/data-release/upstream-check/config";
import { ghIssueTracker, syncIssues } from "../src/lib/data-release/upstream-check/issues";
import { describeResult } from "../src/lib/data-release/upstream-check/report";
import { gh } from "./gh";

// Fetches every pinned source from its publisher, compares it with the pinned
// copy in the mirror, and says what changed. See "Checking upstream for
// changes" in the README.
//
//   pnpm data:check                 check every source; print what it would file
//   pnpm data:check bsb tyndale     only the sources named, by catalog id
//   pnpm data:check --file-issues   also file or update the GitHub issues
//
// It never changes a pin, the fixture, the download cache or the mirror.

const STATE_FILE = path.join(".cache", "upstream-check", "state.json");

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith("--"));
const unknown = flags.filter((flag) => flag !== "--file-issues");
const entries = pinnedFiles();
const named = args.filter((arg) => !arg.startsWith("--"));
const unnamed = named.filter((id) => !entries.some((entry) => entry.id === id));
if (unknown.length > 0 || unnamed.length > 0) {
  console.error(
    `Unknown ${unknown.length > 0 ? `argument: ${unknown.join(" ")}` : `source: ${unnamed.join(" ")}`}\n` +
      "Usage: pnpm data:check [--file-issues] [source id ...]\n" +
      `Sources: ${entries.map((entry) => entry.id).join(", ")}`,
  );
  process.exit(1);
}
const fileIssues = flags.includes("--file-issues");

try {
  const previous = await readFile(STATE_FILE, "utf8")
    .then((text) => JSON.parse(text) as CheckState)
    .catch(() => EMPTY_STATE);
  const now = new Date();
  const selected = entries.filter((entry) => named.length === 0 || named.includes(entry.id));

  const { results, state } = await checkSources({
    entries: selected,
    fetcher: httpFetcher(),
    mirror: mirrorUrl(),
    config: UPSTREAM_CHECK,
    previous: { unavailable: { ...EMPTY_STATE.unavailable, ...previous.unavailable } },
    now,
    log: console.log,
  });

  console.log("");
  const lines = results.map((result) => `${result.entry.id}: ${describeResult(result, UPSTREAM_CHECK)}`);
  for (const line of lines) console.log(line);

  // In the workflow, the issues go to the repository it runs in.
  const repository = process.env.GITHUB_REPOSITORY || DATA_RELEASE_REPOSITORY;
  const tracker = ghIssueTracker(gh, repository);
  const actions = await syncIssues({
    results,
    // A dry run only reads the tracker, and does without it when it cannot.
    tracker: fileIssues
      ? tracker
      : {
          ...tracker,
          list: (label) =>
            tracker.list(label).catch((error: unknown) => {
              console.log(`The existing issues could not be read, so none is assumed: ${error instanceof Error ? error.message : error}`);
              return [];
            }),
        },
    config: UPSTREAM_CHECK,
    now,
    dryRun: !fileIssues,
  });

  console.log("");
  const would = fileIssues ? "" : "would be ";
  const done: string[] = [];
  for (const action of actions) {
    if (action.action === "file") {
      done.push(`${action.draft.source}: ${would}filed${action.url ? ` as ${action.url}` : ""}: ${action.draft.title}`);
      if (!fileIssues) console.log(`--- the issue for ${action.draft.source} ---\n${action.draft.title}\n\n${action.draft.body}\n---`);
    } else if (action.action === "update") {
      done.push(`${action.draft.source}: #${action.number} ${would}updated${action.comment ? ", with a comment" : ""}`);
      if (!fileIssues) console.log(`--- the issue for ${action.draft.source} (#${action.number}) ---\n${action.draft.title}\n\n${action.draft.body}\n---`);
    } else if (action.action === "close") {
      done.push(`${action.source}: #${action.number} ${would}closed`);
    } else {
      done.push(`${action.source}: nothing filed, ${action.why}`);
    }
  }
  if (done.length === 0) done.push("Nothing significant: no issue to file or update.");
  for (const line of done) console.log(line);
  if (!fileIssues && actions.length > 0) {
    console.log("\nThis was a dry run. Run `pnpm data:check --file-issues` to file them.");
  }

  // A dry run leaves no trace, and a run of a few sources does not speak for
  // the others.
  if (fileIssues) {
    const kept = Object.fromEntries(
      Object.entries(previous.unavailable ?? {}).filter(([id]) => !selected.some((entry) => entry.id === id)),
    );
    await mkdir(path.dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify({ unavailable: { ...kept, ...state.unavailable } }, null, 2) + "\n");
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `## Upstream check${fileIssues ? "" : " (dry run)"}`,
        "| Source | Found |\n| :--- | :--- |\n" +
          results
            .map((result) => `| \`${result.entry.id}\` | ${describeResult(result, UPSTREAM_CHECK).replaceAll("|", "\\|")} |`)
            .join("\n"),
        done.map((line) => `- ${line}`).join("\n"),
      ].join("\n\n") + "\n",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
