import type { ItemKind } from "@/lib/items/queries";
import { tagSlug } from "@/lib/items/tags";

// The owner's own pages for what they have made.
//
//   /items                     everything: highlights, reflections and notes
//   /items?kind=reflection     ... of one kind
//   /items?tag=grace           ... with one tag
//   /items?page=2              ... twenty to a page
//   /items/<id>/edit           the editor of a reflection or a note

export const ITEMS_PAGE_SIZE = 20;

const KINDS: readonly ItemKind[] = ["highlight", "reflection", "note"];

export type ItemFilters = { kind?: ItemKind; tag?: string; page?: number };

type Params = { kind?: string; tag?: string; page?: string };

export function parseItemFilters({ kind, tag, page }: Params): ItemFilters {
  const number = /^\d{1,6}$/.test(page ?? "") ? Number(page) : 1;
  return {
    kind: KINDS.find((known) => known === kind),
    tag: (tag && tagSlug(tag)) || undefined,
    page: number > 1 ? number : undefined,
  };
}

export function itemsPath({ kind, tag, page = 1 }: ItemFilters = {}): string {
  const query = [
    kind && `kind=${kind}`,
    tag && `tag=${encodeURIComponent(tag)}`,
    page > 1 && `page=${page}`,
  ].filter(Boolean);
  return query.length > 0 ? `/items?${query.join("&")}` : "/items";
}

export const editItemPath = (id: string) => `/items/${id}/edit`;
