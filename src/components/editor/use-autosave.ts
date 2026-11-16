"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  createDraftAction,
  saveItemAction,
  type CreateResult,
  type SaveResult,
} from "@/app/items/actions";
import { editItemPath } from "@/lib/items-url";

import {
  MAX_UNANSWERED,
  blank,
  decideKept,
  keptValues,
  newToken,
  same,
  type Kept,
  type OldKept,
  type Values,
} from "./kept-draft";

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
// the editor picks it up again when it opens, shows it as not saved, and
// saves it.
//
// Whether kept text may be saved over what the item has is decided by which
// save wrote that, never by comparing times (the browser's clock and the
// server's can disagree by any amount). Every save carries a token the
// editor makes, the item keeps the token of the save that wrote its text
// (`item.save_token`), and kept text says which save it was written on and
// which it has sent since without hearing back. When the item's text is from
// one of those, the kept text follows it and is saved. When it is from
// anywhere else (another tab, another device), the kept text is shown but
// not saved until the writer chooses: it is never thrown away, nor written
// over the other text, without asking. A save is refused by the server on
// the same grounds, so two tabs cannot silently write over each other.

export type { Values };

export type SaveStatus = "new" | "saved" | "unsaved" | "saving" | "failed" | "conflict";

export type SaveFailure = Extract<SaveResult, { ok: false }>;

// How long after the last change a save starts.
export const AUTOSAVE_DELAY_MS = 800;

type AutosaveOptions = {
  // The item, once there is one.
  id?: string;
  kind: "reflection" | "note";
  // What is saved, when (the item's `updated_at`, ISO), and by which save
  // (the item's `save_token`).
  saved: Values;
  savedAt?: string;
  saveToken?: string | null;
  // For a new note written in the reader: the verses it is on.
  anchor?: { v: string; translationId: string };
  // Text this browser kept and the server never got, found when the editor
  // opens: the editor shows it.
  onRestore: (values: Values) => void;
};

export function useAutosave({ id: givenId, kind, saved, savedAt, saveToken, anchor, onRestore }: AutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>(givenId ? "saved" : "new");
  const [failure, setFailure] = useState<SaveFailure>({ ok: false });
  const [id, setId] = useState(givenId);

  // What is written, what the server has, and which save it was.
  const latest = useRef(saved);
  const stored = useRef(saved);
  const storedToken = useRef<string | null>(saveToken ?? null);
  // Saves sent whose answers never came: the server may have made any.
  const unanswered = useRef<string[]>([]);
  // The item's text is from a save the text here does not follow: `token`
  // is that save's. Nothing is saved until the writer chooses.
  const conflict = useRef<{ token: string | null } | null>(null);
  // Save even what looks saved: the writer chose this text over another.
  const force = useRef(false);
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
      const kept: Kept = { v: 2, ...values, base: storedToken.current, sent: unanswered.current, at: Date.now() };
      localStorage.setItem(key(), JSON.stringify(kept));
    } catch {
      // Storage is full or off: autosave alone.
    }
  };

  // Forgets the kept text once the server has it: only if it is what was
  // saved, as another tab on this post may have kept text of its own since.
  const forget = (values: Values) => {
    try {
      const where = key();
      const kept = JSON.parse(localStorage.getItem(where) ?? "null") as Partial<Values> | null;
      if (kept && same(keptValues(kept), values)) localStorage.removeItem(where);
    } catch {
      // No storage, nothing kept.
    }
  };

  const showConflict = (token: string | null) => {
    conflict.current = { token };
    setFailure({
      ok: false,
      conflict: true,
      token,
      formError:
        "This post was changed in another tab or on another device. Your text here is kept in this browser and has not been saved.",
    });
    setStatus("conflict");
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
    if (conflict.current) {
      // Waiting for the writer: what is written stays kept, unsaved.
      setStatus("conflict");
      return itemId.current;
    }
    while (
      force.current ||
      !same(latest.current, stored.current) ||
      (!itemId.current && !blank(latest.current))
    ) {
      const sending = latest.current;
      if (!itemId.current && (blank(sending) || (kind === "note" && !sending.markdown.trim()))) {
        // Nothing to make a post of yet.
        setStatus("new");
        return undefined;
      }
      setStatus("saving");
      const token = newToken();
      const after = [storedToken.current, ...unanswered.current.filter((sent) => sent !== storedToken.current)];
      // Kept, with this save, before it is sent: if its answer never comes,
      // what is kept still follows the item's text.
      unanswered.current = [...unanswered.current, token].slice(-MAX_UNANSWERED);
      keep(latest.current);
      let result: SaveResult | CreateResult;
      let answered = true;
      try {
        result = itemId.current
          ? await saveItemAction({ id: itemId.current, ...sending, token, after })
          : await createDraftAction({ kind, ...sending, ...anchor, token });
      } catch {
        answered = false;
        result = {
          ok: false,
          formError:
            "Could not reach the server. Your text is kept in this browser and is saved when you write again.",
        };
      }
      if (!result.ok) {
        // Refused: not made. Unanswered: it may have been.
        if (answered) unanswered.current = unanswered.current.filter((sent) => sent !== token);
        const refused = result as SaveFailure;
        if (refused.conflict) {
          showConflict(refused.token);
          keep(latest.current);
          return itemId.current;
        }
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
      storedToken.current = token;
      // The item's text is this save's: earlier saves still on their way are
      // refused, as they do not build on it.
      unanswered.current = [];
      force.current = false;
    }
    forget(stored.current);
    setFailure({ ok: false });
    setStatus(itemId.current ? "saved" : "new");
    return itemId.current;
  };

  const change = useCallback(
    (patch: Partial<Values>) => {
      const next = { ...latest.current, ...patch };
      if (same(next, latest.current)) return;
      latest.current = next;
      keep(next);
      clearTimeout(timer.current);
      if (conflict.current) return;
      setStatus("unsaved");
      timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush],
  );

  // Text this browser kept and the server never got, before anything is
  // painted: it is never shown as saved.
  useLayoutEffect(() => {
    let restore: ReturnType<typeof setTimeout> | undefined;
    try {
      const where = key();
      const kept = JSON.parse(localStorage.getItem(where) ?? "null") as Kept | OldKept | null;
      if (kept) {
        const draft = keptValues(kept);
        // As the page was rendered: not the refs, which this changes (and
        // React may run this twice).
        const decision = decideKept(kept, { id: givenId, values: saved, token: saveToken ?? null, savedAt });
        if (decision === "drop") {
          localStorage.removeItem(where);
        } else {
          // Saves sent from the page before may still be on their way.
          const sent = "v" in kept && kept.v === 2 && Array.isArray(kept.sent) ? kept.sent : [];
          unanswered.current = sent.filter((token) => typeof token === "string").slice(-MAX_UNANSWERED);
          latest.current = draft;
          // Here, before the kept text is painted, so it is never shown as
          // saved: what the server rendered cannot know of it.
          if (decision === "conflict") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            showConflict(saveToken ?? null);
            // What is kept goes on following the save it was written on (for
            // text kept before save tokens, one the item can never have).
            storedToken.current = "v" in kept && kept.v === 2 ? kept.base : newToken();
          } else {
            setStatus("unsaved");
          }
          restore = setTimeout(() => {
            restoreRef.current(draft);
            if (decision === "restore") void flush();
          }, 0);
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

  // The writer's choice in a conflict: save the text here over the other.
  const keepMine = useCallback(() => {
    if (!conflict.current) return;
    storedToken.current = conflict.current.token;
    conflict.current = null;
    force.current = true;
    setFailure({ ok: false });
    void flush();
  }, [flush]);

  // ... or open what the item has, throwing the text here away.
  const useSaved = useCallback(() => {
    clearTimeout(timer.current);
    try {
      localStorage.removeItem(key());
    } catch {
      // No storage.
    }
    window.location.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return { id, status, failure, change, flush, discard, keepMine, useSaved };
}
