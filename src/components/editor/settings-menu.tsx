"use client";

import { Popover } from "radix-ui";

import { deleteItemAction } from "@/app/items/actions";
import { MAX_ITEM_TAGS } from "@/lib/items/tags";

type SettingsMenuProps = {
  kind: "reflection" | "note";
  id?: string;
  tags: string;
  tagsError?: string;
  onTags: (tags: string) => void;
  onBlur: () => void;
  // What a note is on, in words.
  anchor?: string;
  // Throws the unsaved new post away.
  onDiscard: () => void;
};

// The post's settings, out of the way until asked for: its tags, what a
// note is on, and deleting it.
export function SettingsMenu({ kind, id, tags, tagsError, onTags, onBlur, anchor, onDiscard }: SettingsMenuProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Post settings"
          title="Tags and settings"
          data-tags-error={tagsError ? "" : undefined}
          className="relative inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 data-[state=open]:bg-stone-100 data-[state=open]:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:data-[state=open]:bg-stone-800"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
            <path d="M2 4.25A.75.75 0 0 1 2.75 3.5h1.4a2 2 0 0 1 3.7 0h5.4a.75.75 0 0 1 0 1.5h-5.4a2 2 0 0 1-3.7 0h-1.4A.75.75 0 0 1 2 4.25Zm0 7.5a.75.75 0 0 1 .75-.75h5.4a2 2 0 0 1 3.7 0h1.4a.75.75 0 0 1 0 1.5h-1.4a2 2 0 0 1-3.7 0h-5.4a.75.75 0 0 1-.75-.75Z" />
          </svg>
          {tagsError && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-red-600" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} aria-label="Post settings" className="editor-popover w-80">
          <label htmlFor="post-tags" className="block text-sm font-semibold">
            Tags
          </label>
          <input
            id="post-tags"
            type="text"
            value={tags}
            onChange={(event) => onTags(event.target.value)}
            onBlur={onBlur}
            placeholder="grace, prayer"
            autoComplete="off"
            aria-invalid={tagsError ? true : undefined}
            aria-describedby="post-tags-hint"
            className="mt-1.5 h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900"
          />
          {tagsError ? (
            <p id="post-tags-hint" role="alert" className="mt-1.5 text-xs text-red-700 dark:text-red-400">
              {tagsError}
            </p>
          ) : (
            <p id="post-tags-hint" className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Separated by commas, up to {MAX_ITEM_TAGS}.
            </p>
          )}

          {anchor && (
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">
              This note is on <span className="font-medium text-stone-900 dark:text-stone-100">{anchor}</span>.
            </p>
          )}

          <div className="mt-5 border-t border-stone-200 pt-3 dark:border-stone-800">
            {id ? (
              <form action={deleteItemAction}>
                <input type="hidden" name="id" value={id} />
                <button
                  type="submit"
                  className="cursor-pointer text-sm text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-red-600 dark:text-red-400"
                >
                  Delete this {kind}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onDiscard}
                className="cursor-pointer text-sm text-red-700 underline-offset-4 hover:underline dark:text-red-400"
              >
                Discard this draft
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
