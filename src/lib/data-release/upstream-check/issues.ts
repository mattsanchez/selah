import type { Gh } from "../publish";
import type { SourceResult } from "./check";
import type { UpstreamCheckConfig } from "./config";
import { draftIssue, readMarker, type IssueDraft, type Marker } from "./report";

// Files what a run found as GitHub issues: one per source, found again on
// later runs by the marker in its body and the label, never by its title.

export type TrackedIssue = { number: number; title: string; body: string; state: "open" | "closed"; url: string };

type Label = UpstreamCheckConfig["label"];

// The issue tracker, as far as the check uses it.
export type IssueTracker = {
  // Every issue with the label, open and closed, newest first.
  list(label: string): Promise<TrackedIssue[]>;
  ensureLabel(label: Label): Promise<void>;
  create(issue: { title: string; body: string; label: string }): Promise<{ number: number; url: string }>;
  edit(number: number, issue: { title: string; body: string }): Promise<void>;
  comment(number: number, body: string): Promise<void>;
  close(number: number, comment: string): Promise<void>;
};

// The tracker of a GitHub repository, through the `gh` CLI and whatever
// credentials it has (GH_TOKEN in the workflow).
export function ghIssueTracker(gh: Gh, repository: string): IssueTracker {
  const run = async (args: string[]) => {
    const { code, stdout, stderr } = await gh([...args, "--repo", repository]);
    if (code !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed:\n${stderr.trim() || stdout.trim()}`);
    return stdout;
  };
  return {
    async list(label) {
      const stdout = await run([
        "issue", "list", "--label", label, "--state", "all", "--limit", "500",
        "--json", "number,title,body,state,url",
      ]);
      return (JSON.parse(stdout) as (Omit<TrackedIssue, "state"> & { state: string })[])
        .map((issue) => ({ ...issue, state: issue.state.toLowerCase() === "open" ? ("open" as const) : ("closed" as const) }))
        .sort((a, b) => b.number - a.number);
    },
    async ensureLabel({ name, color, description }) {
      const { code, stdout, stderr } = await gh([
        "label", "create", name, "--color", color, "--description", description, "--repo", repository,
      ]);
      if (code !== 0 && !/already exists/i.test(stderr + stdout)) {
        throw new Error(`gh label create failed:\n${stderr.trim() || stdout.trim()}`);
      }
    },
    async create({ title, body, label }) {
      const url = (await run(["issue", "create", "--title", title, "--body", body, "--label", label])).trim();
      return { number: Number(/\/(\d+)\s*$/.exec(url)?.[1]), url };
    },
    async edit(number, { title, body }) {
      await run(["issue", "edit", String(number), "--title", title, "--body", body]);
    },
    async comment(number, body) {
      await run(["issue", "comment", String(number), "--body", body]);
    },
    async close(number, comment) {
      await run(["issue", "close", String(number), "--comment", comment]);
    },
  };
}

export type IssueAction =
  | { action: "file"; draft: IssueDraft; number?: number; url?: string }
  // An open issue's text was brought up to date; with `comment`, the change
  // was worth telling its subscribers.
  | { action: "update"; draft: IssueDraft; number: number; comment?: string }
  | { action: "leave"; source: string; number: number; why: string }
  | { action: "close"; source: string; number: number; comment: string };

const same = (a: readonly string[] = [], b: readonly string[] = []) => a.join("\n") === b.join("\n");

// Brings the tracker in line with a run's results and returns what it did.
// With `dryRun` it does nothing but read the tracker, and returns what it
// would have done.
export async function syncIssues({
  results,
  tracker,
  config,
  now = new Date(),
  dryRun = false,
}: {
  results: readonly SourceResult[];
  tracker: IssueTracker;
  config: UpstreamCheckConfig;
  now?: Date;
  dryRun?: boolean;
}): Promise<IssueAction[]> {
  const label = config.label.name;
  // The newest issue for each source.
  const latest = new Map<string, TrackedIssue & { marker: Marker }>();
  for (const issue of await tracker.list(label)) {
    const marker = readMarker(issue.body);
    if (marker && !latest.has(marker.source)) latest.set(marker.source, { ...issue, marker });
  }

  const actions: IssueAction[] = [];
  let labelled = false;
  const date = now.toISOString().slice(0, 10);

  for (const result of results) {
    const source = result.entry.id;
    const draft = draftIssue(result, config, now);
    const existing = latest.get(source);
    const open = existing?.state === "open" ? existing : undefined;

    if (!draft) {
      // The publisher's file was read and is fine again: the refresh was
      // merged, or the publisher took the change back.
      if (open && result.status !== "unavailable") {
        const comment =
          `The upstream check of ${date} found nothing significant in \`${source}\` any more: ` +
          "its pin was refreshed, or the publisher's file went back to the pinned content. Closing.";
        if (!dryRun) await tracker.close(open.number, comment);
        actions.push({ action: "close", source, number: open.number, comment });
      }
      continue;
    }

    if (open) {
      const changed =
        open.marker.recommendation !== draft.recommendation ||
        !same(open.marker.classifications, draft.classifications);
      const comment = changed
        ? `The upstream check of ${date} found this source changed again. ` +
          `It is now classified as: ${draft.classifications.join("; ")}. Recommendation: **${draft.recommendation}**. ` +
          "The description above has the details."
        : undefined;
      if (!dryRun) {
        await tracker.edit(open.number, draft);
        if (comment) await tracker.comment(open.number, comment);
      }
      actions.push({ action: "update", draft, number: open.number, comment });
      continue;
    }

    if (existing && existing.marker.fingerprint === draft.fingerprint) {
      actions.push({
        action: "leave",
        source,
        number: existing.number,
        why: `#${existing.number} was closed on this same state of the publisher's file`,
      });
      continue;
    }

    if (dryRun) {
      actions.push({ action: "file", draft });
      continue;
    }
    if (!labelled) await tracker.ensureLabel(config.label);
    labelled = true;
    const created = await tracker.create({ title: draft.title, body: draft.body, label });
    actions.push({ action: "file", draft, ...created });
  }
  return actions;
}
