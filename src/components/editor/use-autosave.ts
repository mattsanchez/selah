"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createDraftAction,
  saveItemAction,
  type CreateResult,
  type SaveResult,
} from "@/app/items/actions";
import { editItemPath } from "@/lib/items-url";

// Saving what is written, as it is written.
//
// A change is saved AUTOSAVE_DELAY_MS after the last one, at once when the
// writer leaves a field or presses Ctrl/Cmd+S, and one save at a time: what
// is typed during a save goes in the next. A new post (/write) is made by
// its first save; from then on the address is its editor's,
// /items/<id>/edit, without the page being loaded again.
//
// Until the server has it, the text is also kept in this browser
// (localStorage), so a reload or a lost connection in between loses nothing:
// the editor picks it up again when it opens, unless the item has been
// saved from somewhere else since.

export type Values = { title: string; markdown: string; tags: string };

export type SaveStatus = "new" | "saved" | "unsaved" | "saving" | "failed";

export type SaveFailure = Extract<SaveResult, { ok: false }>;

// How long after the last change a save starts.
export const AUTOSAVE_DELAY_MS = 800;

const same = (a: Values, b: Values) =>
  a.title === b.title && a.markdown === b.markdown && a.tags === b.tags;

const blank = (values: Values) => !values.title.trim() && !values.markdown.trim() && !values.tags.trim();

type AutosaveOptions = {
  // The item, once there is one.
  id?: string;
  kind: "reflection" | "note";
  // What is saved, and when it was (the item's `updated_at`, ISO).
  saved: Values;
  savedAt?: string;
  // For a new note written in the reader: the verses it is on.
  anchor?: { v: string; translationId: string };
  // Text this browser kept and the server never got, found when the editor
  // opens: the editor shows it, and it is saved.
  onRestore: (values: Values) => void;
};

export function useAutosave({ id: givenId, kind, saved, savedAt, anchor, onRestore }: AutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>(givenId ? "saved" : "new");
  const [failure, setFailure] = useState<SaveFailure>({ ok: false });
  const [id, setId] = useState(givenId);

  // What is written, what the server has, and when it got it.
  const latest = useRef(saved);
  const stored = useRef(saved);
  const storedAt = useRef(savedAt ?? "");
  const itemId = useRef(givenId);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The save in flight, which every flush meanwhile waits for.
  const saving = useRef<Promise<string | undefined> | null>(null);
  const newKey = `selah:draft:new:${kind}:${anchor?.v ?? ""}`;
  const key = () => (itemId.current ? `selah:draft:${itemId.current}` : newKey);

  const restoreRef = useRef(onRestore);
  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  const keep = (values: Values) => {
    try {
      localStorage.setItem(key(), JSON.stringify({ ...values, base: storedAt.current, at: Date.now() }));
    } catch {
      // Storage is full or off: autosave alone.
    }
  };

  // Saves what is not saved yet, and answers with the item's id once the
  // server has it all (undefined while there is nothing to make a post of).
  // One save at a time: the one in flight goes round again for what was
  // written meanwhile, and a flush during it waits for it.
  const flush = useCallback((): Promise<string | undefined> => {
    clearTimeout(timer.current);
    saving.current ??= save().finally(() => {
      saving.current = null;
    });
    return saving.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKey]);

  const save = async (): Promise<string | undefined> => {
    while (!same(latest.current, stored.current) || (!itemId.current && !blank(latest.current))) {
      const sending = latest.current;
      if (!itemId.current && (blank(sending) || (kind === "note" && !sending.markdown.trim()))) {
        // Nothing to make a post of yet.
        setStatus("new");
        return undefined;
      }
      setStatus("saving");
      let result: SaveResult | CreateResult;
      try {
        result = itemId.current
          ? await saveItemAction({ id: itemId.current, ...sending })
          : await createDraftAction({ kind, ...sending, ...anchor });
      } catch {
        result = {
          ok: false,
          formError:
            "Could not reach the server. Your text is kept in this browser and is saved when you write again.",
        };
      }
      if (!result.ok) {
        setFailure(result);
        setStatus("failed");
        return itemId.current;
      }
      const made = "id" in result ? (result as Extract<CreateResult, { ok: true }>) : undefined;
      if (made) {
        // Made: from now on this is the item's editor.
        try {
          localStorage.removeItem(newKey);
        } catch {
          // No storage.
        }
        itemId.current = made.id;
        setId(made.id);
        window.history.replaceState(window.history.state, "", editItemPath(made.id));
      }
      stored.current = sending;
      storedAt.current = result.savedAt;
    }
    try {
      localStorage.removeItem(key());
    } catch {
      // No storage, nothing kept.
    }
    setFailure({ ok: false });
    setStatus(itemId.current ? "saved" : "new");
    return itemId.current;
  };

  const change = useCallback(
    (patch: Partial<Values>) => {
      const next = { ...latest.current, ...patch };
      if (same(next, latest.current)) return;
      latest.current = next;
      setStatus("unsaved");
      keep(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush],
  );

  // Text this browser kept and the server never got.
  useEffect(() => {
    let restore: ReturnType<typeof setTimeout> | undefined;
    try {
      const where = key();
      const kept = JSON.parse(localStorage.getItem(where) ?? "null") as
        | (Partial<Values> & { base?: string; at?: number })
        | null;
      if (kept) {
        const draft = {
          title: String(kept.title ?? ""),
          markdown: String(kept.markdown ?? ""),
          tags: String(kept.tags ?? ""),
        };
        const newer =
          !itemId.current ||
          kept.base === storedAt.current ||
          Number(kept.at) > Date.parse(storedAt.current);
        if (newer && !same(draft, stored.current)) {
          restore = setTimeout(() => {
            latest.current = draft;
            restoreRef.current(draft);
            void flush();
          }, 0);
        } else {
          localStorage.removeItem(where);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

  // Throws away a new post that was never saved.
  const discard = useCallback(() => {
    clearTimeout(timer.current);
    latest.current = stored.current;
    try {
      localStorage.removeItem(newKey);
    } catch {
      // No storage.
    }
  }, [newKey]);

  return { id, status, failure, change, flush, discard };
}
