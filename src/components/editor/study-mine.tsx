"use client";

import { useEffect, useRef, useState } from "react";

import type { ContentData, ContentItem } from "@/lib/editor/types";
import { itemLinkPath } from "@/lib/items-url";

import type { StudyPanelProps } from "./study-sidebar";

const KIND = { highlight: "Highlight", reflection: "Reflection", note: "Note" } as const;

const field =
  "h-9 min-w-0 rounded-md border border-stone-300 bg-white px-3 text-sm placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900";
const quiet =
  "inline-flex h-7 cursor-pointer items-center rounded px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// What an item is called in a list and in a link to it.
export function itemName(item: ContentItem): string {
  if (item.title) return item.title;
  if (item.kind === "highlight") return item.reference ?? "Highlight";
  if (item.excerpt) return item.excerpt.length > 80 ? `${item.excerpt.slice(0, 80).replace(/\s+\S*$/, "")}…` : item.excerpt;
  return item.kind === "reflection" ? "Untitled reflection" : "Note";
}

type Filters = { q: string; tag: string; passage: string };

// "My content": the owner's highlights, notes and reflections, newest first,
// filtered by words, tag and passage. A highlight goes into the post as its
// passage; a note or a reflection as a link to it.
export function MinePanel({ bridge, active }: StudyPanelProps) {
  const [filters, setFilters] = useState<Filters>({ q: "", tag: "", passage: "" });
  const [data, setData] = useState<ContentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(0);

  const load = async (wanted: Filters, offset = 0) => {
    const ask = ++asked.current;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/editor/items?${new URLSearchParams({
          q: wanted.q,
          tag: wanted.tag,
          passage: wanted.passage,
          offset: String(offset),
          ...(bridge.itemId && { except: bridge.itemId }),
        })}`,
      );
      const body = (await response.json()) as ContentData | { error: string };
      if (ask !== asked.current) return;
      if ("error" in body) {
        setError(body.error);
        return;
      }
      setError(null);
      setData((current) =>
        offset > 0 && current ? { ...body, items: [...current.items, ...body.items] } : body,
      );
    } catch {
      if (ask === asked.current) setError("Your content could not be loaded. Check the connection.");
    } finally {
      if (ask === asked.current) setLoading(false);
    }
  };

  // Loaded when first opened, and again as the filters change.
  const [opened, setOpened] = useState(false);
  if (active && !opened) setOpened(true);
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => void load(filters), filters.q || filters.passage ? 250 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, filters]);

  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const insert = (item: ContentItem) => {
    if (item.kind === "highlight" && item.reference) {
      bridge.insertPassage(item.reference, item.translation ?? bridge.translations[0]?.abbrev ?? "");
    } else {
      bridge.insertLink(itemName(item), itemLinkPath(item.id));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div role="search" aria-label="Filter my content" className="space-y-2 px-4 pt-4">
        <input
          type="search"
          value={filters.q}
          onChange={(event) => set({ q: event.target.value })}
          placeholder="Words"
          aria-label="Words"
          autoComplete="off"
          className={`${field} w-full`}
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={filters.passage}
            onChange={(event) => set({ passage: event.target.value })}
            placeholder="Passage"
            aria-label="On passage"
            aria-invalid={error && filters.passage ? true : undefined}
            autoComplete="off"
            spellCheck={false}
            className={`${field} flex-1`}
          />
          <select
            value={filters.tag}
            onChange={(event) => set({ tag: event.target.value })}
            aria-label="Tag"
            className={`${field} max-w-[45%] px-2`}
          >
            <option value="">Any tag</option>
            {data?.tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>
                #{tag.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-busy={loading || undefined}>
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {data && data.items.length === 0 && (
          <p role="status" className="text-sm text-stone-500 dark:text-stone-400">
            {filters.q || filters.tag || filters.passage ? "Nothing matches." : "Nothing yet."}
          </p>
        )}
        {data && data.items.length > 0 && (
          <ol aria-label="My content" className="space-y-2">
            {data.items.map((item) => (
              <li
                key={item.id}
                data-content-item={item.id}
                data-kind={item.kind}
                data-highlight={item.color ?? undefined}
                className="mine-item"
              >
                <p className="flex flex-wrap items-center gap-x-1.5 text-[0.7rem] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                  {item.kind === "highlight" && <span className="highlight-swatch size-2.5" aria-hidden="true" />}
                  {KIND[item.kind]}
                  <span aria-hidden="true">·</span>
                  <time dateTime={item.createdAt} className="font-normal normal-case">
                    {new Date(item.createdAt).toLocaleDateString("en", { dateStyle: "medium" })}
                  </time>
                </p>
                <p className="mt-0.5 text-sm font-medium text-stone-900 dark:text-stone-100">{itemName(item)}</p>
                {item.kind === "highlight" && item.note && (
                  <p className="text-sm text-stone-600 dark:text-stone-300">{item.note}</p>
                )}
                {item.kind !== "highlight" && item.title && item.excerpt && (
                  <p className="line-clamp-2 text-sm text-stone-600 dark:text-stone-300">{item.excerpt}</p>
                )}
                {item.kind !== "highlight" && item.reference && (
                  <p className="text-xs text-stone-500 dark:text-stone-400">On {item.reference}</p>
                )}
                <div className="mt-1">
                  {(item.kind !== "highlight" || bridge.passages) && (
                    <button
                      type="button"
                      onClick={() => insert(item)}
                      aria-label={
                        item.kind === "highlight" ? `Insert ${item.reference}` : `Insert a link to ${itemName(item)}`
                      }
                      className={quiet}
                    >
                      {item.kind === "highlight" ? "Insert passage" : "Insert link"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {data && data.items.length < data.total && (
          <button
            type="button"
            onClick={() => void load(filters, data.items.length)}
            className="mt-4 h-8 w-full cursor-pointer rounded-md border border-stone-300 text-sm hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"
          >
            More
          </button>
        )}
      </div>
    </div>
  );
}
