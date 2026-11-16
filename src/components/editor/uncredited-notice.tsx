"use client";

import type { ReactNode } from "react";

import { MATCH_WORDS } from "@/lib/items/source-words";
import type { UncreditedMatch } from "@/lib/items/uncredited";

// What the editor says when a post has words of a share-alike source's notes
// outside a quote that credits it: in the publish menu before it is
// published, and above a published post while it is edited. A warning only:
// the owner decides what to change, if anything, and may publish as it is.

// The same words of the same note, wherever they were found.
export const matchKey = (match: UncreditedMatch) =>
  `${match.sourceId}|${match.reference}|${match.excerpt}`;

// The matches not yet seen and set aside by the owner.
export const unacknowledged = (matches: readonly UncreditedMatch[], acknowledged: ReadonlySet<string>) =>
  matches.filter((match) => !acknowledged.has(matchKey(match)));

const link = "underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-50";

export function UncreditedNotice({
  matches,
  published,
  children,
}: {
  matches: readonly UncreditedMatch[];
  // Said of a published post (whose words are already public) or of one
  // about to be.
  published: boolean;
  // The buttons.
  children?: ReactNode;
}) {
  const sources = [...new Set(matches.map((match) => match.source))];
  const named = sources.join(" and ");
  return (
    <div data-uncredited className="text-sm text-amber-900 dark:text-amber-200">
      <p className="font-semibold">
        {published ? "This published post has" : "This post has"} words from {named} without its credit
      </p>
      <ul className="mt-2 space-y-2">
        {matches.map((match) => (
          <li key={matchKey(match)} data-uncredited-match={match.reference}>
            <span className="block">
              {match.words} words in a row match {match.source} on{" "}
              <a href={match.href} target="_blank" rel="noopener" className={link}>
                {match.reference}
              </a>
              :
            </span>
            <q className="mt-0.5 block border-l-2 border-amber-300 pl-2 italic dark:border-amber-700">{match.excerpt}</q>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        They are not inside a quote that credits {named}, so nothing in the post marks them as its words. To credit them, insert the note from Study → Ask (it brings its credit with it) and remove the copied words. Or
        leave them: this is only a warning.
      </p>
      <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">
        {matches
          .filter((match, i) => matches.findIndex((each) => each.sourceId === match.sourceId) === i)
          .map((match) => (
            <span key={match.sourceId} className="mr-2">
              <a href={match.sourceUrl} target="_blank" rel="noopener" className={link}>
                {match.source}
              </a>{" "}
              ·{" "}
              <a href={match.licenseUrl} target="_blank" rel="noopener" className={link}>
                {match.license}
              </a>
            </span>
          ))}
        Selah looks only for {MATCH_WORDS} or more words in a row, word for word. It does not notice paraphrase, and it cannot tell
        you what the license requires.
      </p>
      {children}
    </div>
  );
}
