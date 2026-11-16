"use client";

import { Popover } from "radix-ui";
import { useState } from "react";

import { checkUncreditedAction, publishItemAction } from "@/app/items/actions";
import type { ItemVisibility } from "@/lib/items/queries";
import type { UncreditedMatch } from "@/lib/items/uncredited";

import { UncreditedNotice, matchKey, unacknowledged } from "./uncredited-notice";

type PublishMenuProps = {
  kind: "reflection" | "note";
  visibility: ItemVisibility;
  publishedAt: string | null;
  // Saves what is not saved yet (making the post if it is new) and returns
  // its id, or undefined when there is nothing to publish.
  save: () => Promise<string | undefined>;
  // Why it cannot be published now, if it cannot (the text here conflicts
  // with what was saved elsewhere).
  blocked?: string;
  onPublished: (visibility: ItemVisibility, publishedAt: string | null) => void;
  // Words of a share-alike source's notes the owner has been warned about
  // and chose to publish anyway (matchKey), and telling the editor so.
  acknowledged: ReadonlySet<string>;
  onAcknowledge: (matches: readonly UncreditedMatch[]) => void;
};

const CHOICES: { value: Exclude<ItemVisibility, "private">; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "In your feed, for anyone" },
  { value: "unlisted", label: "Unlisted", hint: "Only for those with the link" },
];

const pill =
  "h-8 cursor-pointer rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const published =
  "border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800";
const primary =
  "h-8 cursor-pointer rounded-full bg-stone-900 px-4 text-sm font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-wait disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300";

// "Publish" (a note's "Post"): who may see the post, and putting it out or
// taking it back. A post is private, a draft, until it is published.
export function PublishMenu({
  kind,
  visibility,
  publishedAt,
  save,
  blocked,
  onPublished,
  acknowledged,
  onAcknowledge,
}: PublishMenuProps) {
  const isPublished = visibility !== "private";
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Exclude<ItemVisibility, "private">>(isPublished ? visibility : "public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uncredited words found in what was about to be published.
  const [warning, setWarning] = useState<{ matches: UncreditedMatch[]; wanted: ItemVisibility } | null>(null);
  const verb = kind === "note" ? "Post" : "Publish";

  // `seen`: the matches the owner was just shown and chose to publish with.
  const apply = async (wanted: ItemVisibility, seen: ReadonlySet<string> = acknowledged) => {
    if (blocked) {
      setError(blocked);
      return;
    }
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const id = await save();
      if (!id) {
        setError(kind === "note" ? "Write the note first." : "Write something first.");
        return;
      }
      // Before it is made (or kept) public, a look for a note's words without
      // its credit, in the text just saved. It never stops publishing on its
      // own: a failed check is passed over, and the owner may go on.
      if (wanted !== "private") {
        const check = await checkUncreditedAction({ id }).catch(() => ({ ok: false as const }));
        const unseen = check.ok ? unacknowledged(check.matches, seen) : [];
        if (check.ok && unseen.length > 0) {
          setWarning({ matches: check.matches, wanted });
          return;
        }
      }
      const result = await publishItemAction({ id, visibility: wanted });
      if (!result.ok) {
        setError(result.formError);
        return;
      }
      onPublished(result.visibility, result.publishedAt);
      setOpen(false);
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setChoice(isPublished ? (visibility as typeof choice) : "public");
        setWarning(null);
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" data-publish-state={visibility} className={isPublished ? `${pill} ${published}` : primary}>
          {isPublished ? (visibility === "public" ? "Public" : "Unlisted") : verb}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          aria-label={isPublished ? "Visibility" : verb}
          className={`editor-popover ${warning ? "w-[min(24rem,calc(100vw-2rem))]" : "w-72"}`}
        >
          {warning ? (
            <UncreditedNotice matches={warning.matches} published={isPublished}>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="cursor-pointer text-sm text-stone-600 underline-offset-4 hover:underline dark:text-stone-300"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onAcknowledge(warning.matches);
                    void apply(warning.wanted, new Set([...acknowledged, ...warning.matches.map(matchKey)]));
                  }}
                  className={primary}
                >
                  {isPublished ? "Update anyway" : `${verb} anyway`}
                </button>
              </div>
            </UncreditedNotice>
          ) : (
            <>
              <p className="text-sm font-semibold">{isPublished ? "Published" : `${verb} this ${kind}`}</p>
              <p data-published-at className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                {isPublished && publishedAt
                  ? `${visibility === "public" ? "Public" : "Unlisted"} since ${new Date(publishedAt).toLocaleDateString("en", { dateStyle: "medium" })}.`
                  : "A draft: only you can see it until you publish it."}
              </p>
              <fieldset className="mt-3 space-y-1.5">
                <legend className="sr-only">Who can see it</legend>
                {CHOICES.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-stone-200 p-2.5 has-[:checked]:border-stone-900 dark:border-stone-700 dark:has-[:checked]:border-stone-100"
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={option.value}
                      checked={choice === option.value}
                      onChange={() => setChoice(option.value)}
                      className="mt-1 accent-stone-900 dark:accent-stone-100"
                    />
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-stone-500 dark:text-stone-400">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                {isPublished ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void apply("private")}
                    className="cursor-pointer text-sm text-stone-600 underline-offset-4 hover:underline dark:text-stone-300"
                  >
                    Unpublish
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  disabled={busy || (isPublished && choice === visibility)}
                  onClick={() => void apply(choice)}
                  className={primary}
                >
                  {isPublished ? "Update" : `${verb} now`}
                </button>
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
