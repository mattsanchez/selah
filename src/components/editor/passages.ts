"use client";

import { useEffect, useSyncExternalStore } from "react";

import { passageKey, type PassageData } from "@/lib/editor/types";

// The passages the editor has asked the server for, kept for the life of the
// page: a passage block, its undo, a change of translation and back, and the
// sidebar's insert all reuse what was fetched once. The editor page hands
// over the verses of the cards it opens with (primePassages), so a post
// opens with its passages already printed.

type Use = "card" | "reading";

const known = new Map<string, PassageData>();
const pending = new Map<string, Promise<PassageData>>();
const listeners = new Set<() => void>();
// Failures to reach the server, which are shown but asked again next time.
const transient = new Set<string>();

function store(key: string, data: PassageData, retry = false) {
  known.set(key, data);
  if (retry) transient.add(key);
  else transient.delete(key);
  for (const listener of listeners) listener();
}

export function primePassages(entries: Readonly<Record<string, PassageData>>): void {
  for (const [key, data] of Object.entries(entries)) if (!known.has(key)) known.set(key, data);
}

export function rememberPassage(
  reference: string,
  translation: string | null | undefined,
  use: Use,
  data: PassageData,
): void {
  store(passageKey(reference, translation, use), data);
}

export function fetchPassage(
  reference: string,
  translation: string | null | undefined,
  use: Use,
): Promise<PassageData> {
  const key = passageKey(reference, translation, use);
  const have = known.get(key);
  if (have && !transient.has(key)) return Promise.resolve(have);
  let request = pending.get(key);
  if (!request) {
    const query = new URLSearchParams({ ref: reference, ...(translation && { t: translation }), for: use });
    request = fetch(`/api/editor/passage?${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as PassageData;
        store(key, data);
        return data;
      })
      .catch(() => {
        const failed: PassageData = { ok: false, error: "The passage could not be loaded. Check the connection." };
        store(key, failed, true);
        return failed;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// The passage, once it has come; undefined while it is on its way.
export function usePassage(
  reference: string,
  translation: string | null | undefined,
  use: Use = "card",
): PassageData | undefined {
  const key = passageKey(reference, translation, use);
  const data = useSyncExternalStore(
    subscribe,
    () => known.get(key),
    () => known.get(key),
  );
  useEffect(() => {
    if (!data && reference.trim()) void fetchPassage(reference, translation, use);
  }, [data, reference, translation, use]);
  return data;
}
