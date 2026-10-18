"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { saveItemAction, type SaveResult } from "@/app/items/actions";
import { FormMessage } from "@/components/ui/field";
import {
  MAX_ITEM_TITLE_LENGTH,
  MAX_MARKDOWN_LENGTH,
  MAX_NOTE_BODY_LENGTH,
} from "@/lib/items/validate";

type Values = { title: string; markdown: string; tags: string };

type ItemEditorProps = {
  id: string;
  kind: "reflection" | "note";
  // What is saved, and when it was (the item's `updated_at`, ISO).
  saved: Values;
  savedAt: string;
};

// How long after the last keystroke a save starts.
const AUTOSAVE_DELAY_MS = 800;

type Status = "saved" | "unsaved" | "saving" | "failed";

const STATUS: Record<Status, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  failed: "Not saved",
};

const same = (a: Values, b: Values) =>
  a.title === b.title && a.markdown === b.markdown && a.tags === b.tags;

const control =
  "w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900";

// The editor of a reflection or a note: a title, Markdown and tags, saved as
// they are typed.
//
// Autosave: a change is saved AUTOSAVE_DELAY_MS after the last keystroke, at
// once when the field is left or on Ctrl/Cmd+S, and one save at a time. Until
// the server has it, the text is also kept in this browser (localStorage),
// so a reload or a lost connection in between loses nothing: the editor
// picks it up again when it opens, unless the item has been saved from
// somewhere else since.
//
// Saving renders the page again, which is how the preview below the editor
// keeps up.
export function ItemEditor({ id, kind, saved, savedAt }: ItemEditorProps) {
  const [values, setValues] = useState(saved);
  const [status, setStatus] = useState<Status>("saved");
  const [failure, setFailure] = useState<Extract<SaveResult, { ok: false }>>({ ok: false });
  const fieldId = useId();

  // What is typed, what the server has, and when it got it.
  const latest = useRef(saved);
  const stored = useRef(saved);
  const storedAt = useRef(savedAt);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saving = useRef(false);
  const key = `selah:draft:${id}`;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    // The save in flight goes round again for what was typed meanwhile.
    if (saving.current) return;
    saving.current = true;
    try {
      while (!same(latest.current, stored.current)) {
        const sending = latest.current;
        setStatus("saving");
        let result: SaveResult;
        try {
          result = await saveItemAction({ id, ...sending });
        } catch {
          result = {
            ok: false,
            formError:
              "Could not reach the server. Your text is kept in this browser and is saved when you type again.",
          };
        }
        if (!result.ok) {
          setFailure(result);
          setStatus("failed");
          return;
        }
        stored.current = sending;
        storedAt.current = result.savedAt;
      }
      try {
        localStorage.removeItem(key);
      } catch {
        // No storage, nothing kept.
      }
      setFailure({ ok: false });
      setStatus("saved");
    } finally {
      saving.current = false;
    }
  }, [id, key]);

  const change = (patch: Partial<Values>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setValues(next);
    setStatus("unsaved");
    try {
      localStorage.setItem(key, JSON.stringify({ ...next, base: storedAt.current, at: Date.now() }));
    } catch {
      // Storage is full or off: autosave alone.
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  };

  // Text this browser kept and the server never got.
  useEffect(() => {
    let restore: ReturnType<typeof setTimeout> | undefined;
    try {
      const kept = JSON.parse(localStorage.getItem(key) ?? "null") as
        | (Partial<Values> & { base?: string; at?: number })
        | null;
      if (kept) {
        const draft = {
          title: String(kept.title ?? ""),
          markdown: String(kept.markdown ?? ""),
          tags: String(kept.tags ?? ""),
        };
        const newer =
          kept.base === storedAt.current || Number(kept.at) > Date.parse(storedAt.current);
        if (newer && !same(draft, stored.current)) {
          restore = setTimeout(() => {
            latest.current = draft;
            setValues(draft);
            void flush();
          }, 0);
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Nothing readable was kept.
    }
    return () => {
      clearTimeout(restore);
      // Leaving the page: send what is not saved yet.
      void flush();
    };
  }, [key, flush]);

  const { errors = {} } = failure;
  const describe = (name: keyof Values) => (errors[name] ? `${fieldId}-${name}-error` : undefined);
  const error = (name: keyof Values) =>
    errors[name] && (
      <p id={`${fieldId}-${name}-error`} role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
        {errors[name]}
      </p>
    );

  return (
    <form
      data-item-editor={id}
      className="space-y-4 font-sans"
      onSubmit={(event) => {
        event.preventDefault();
        void flush();
      }}
      onBlur={() => void flush()}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void flush();
        }
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <p
          role="status"
          data-save-status={status}
          className={`text-sm ${status === "failed" ? "text-red-700 dark:text-red-400" : "text-stone-600 dark:text-stone-400"}`}
        >
          {STATUS[status]}
        </p>
      </div>
      {failure.formError && <FormMessage kind="error">{failure.formError}</FormMessage>}

      {kind === "reflection" && (
        <div>
          <label htmlFor={`${fieldId}-title`} className="mb-1.5 block text-sm font-medium">
            Title <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
          </label>
          <input
            id={`${fieldId}-title`}
            type="text"
            value={values.title}
            maxLength={MAX_ITEM_TITLE_LENGTH}
            autoComplete="off"
            onChange={(event) => change({ title: event.target.value })}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describe("title")}
            className={`${control} h-11 font-serif text-xl`}
          />
          {error("title")}
        </div>
      )}

      <div>
        <label htmlFor={`${fieldId}-markdown`} className="mb-1.5 block text-sm font-medium">
          {kind === "reflection" ? "Reflection" : "Note"}
        </label>
        <textarea
          id={`${fieldId}-markdown`}
          value={values.markdown}
          rows={kind === "reflection" ? 16 : 5}
          maxLength={kind === "reflection" ? MAX_MARKDOWN_LENGTH : MAX_NOTE_BODY_LENGTH}
          spellCheck
          onChange={(event) => change({ markdown: event.target.value })}
          aria-invalid={errors.markdown ? true : undefined}
          aria-describedby={`${fieldId}-markdown-hint ${describe("markdown") ?? ""}`.trim()}
          className={`${control} py-2 font-mono text-sm leading-6`}
        />
        <p id={`${fieldId}-markdown-hint`} className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
          {kind === "reflection" ? (
            <>
              Markdown. To embed a passage, put its reference on a line of its own in double
              brackets: <code>[[John 3:16-18]]</code>, or <code>[[Psalm 23 | KJV]]</code> for
              another translation.
            </>
          ) : (
            "Markdown."
          )}
        </p>
        {error("markdown")}
      </div>

      <div>
        <label htmlFor={`${fieldId}-tags`} className="mb-1.5 block text-sm font-medium">
          Tags
        </label>
        <input
          id={`${fieldId}-tags`}
          type="text"
          value={values.tags}
          placeholder="grace, prayer"
          autoComplete="off"
          onChange={(event) => change({ tags: event.target.value })}
          aria-invalid={errors.tags ? true : undefined}
          aria-describedby={`${fieldId}-tags-hint ${describe("tags") ?? ""}`.trim()}
          className={`${control} h-10`}
        />
        <p id={`${fieldId}-tags-hint`} className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
          Separated by commas.
        </p>
        {error("tags")}
      </div>
    </form>
  );
}
