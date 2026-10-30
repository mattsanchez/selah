import { highlightColor } from "@/lib/items/palette";
import type { ItemKind, ItemVisibility } from "@/lib/items/queries";
import { tagSlug } from "@/lib/items/tags";

// The owner's own pages for what they have made.
//
//   /items                     everything: highlights, reflections and notes
//   /items?kind=reflection     ... of one kind
//   /items?tag=grace           ... with one tag
//   /items?page=2              ... twenty to a page
//   /items?q=vine              ... with these words, or close to them in meaning
//   /items?q=vine&exact=1      ... with these words only
//   /items?passage=john+15     ... on verses that overlap this passage
//   /items?color=amber         ... of one highlight color
//   /items?visibility=public   ... this visible
//   /items/<id>                an item, as a post links to it (see below)
//   /items/<id>/edit           the editor of a reflection or a note
//   /write                     a new reflection, in the editor
//   /write?kind=note           a new note
//   /write?kind=note&v=john-3.16&tr=kjv&back=/read/john-3?v=john-3.16
//                              ... on verses selected in the reader (read in
//                              `tr`), returning there once posted

export const ITEMS_PAGE_SIZE = 20;

const KINDS: readonly ItemKind[] = ["highlight", "reflection", "note"];

const VISIBILITIES: readonly ItemVisibility[] = ["private", "unlisted", "public"];

const MAX_SEARCH_LENGTH = 200;

export type ItemFilters = {
  kind?: ItemKind;
  tag?: string;
  page?: number;
  q?: string;
  // A passage as typed; the page parses it and says if it cannot.
  passage?: string;
  color?: string;
  visibility?: ItemVisibility;
  // Words only, not meaning.
  exact?: boolean;
};

type Params = Partial<Record<keyof ItemFilters, string>>;

const typed = (value: string | undefined) => value?.trim().slice(0, MAX_SEARCH_LENGTH) || undefined;

export function parseItemFilters({ kind, tag, page, q, passage, color, visibility, exact }: Params): ItemFilters {
  const number = /^\d{1,6}$/.test(page ?? "") ? Number(page) : 1;
  return {
    kind: KINDS.find((known) => known === kind),
    tag: (tag && tagSlug(tag)) || undefined,
    page: number > 1 ? number : undefined,
    q: typed(q),
    passage: typed(passage),
    color: highlightColor(color)?.id,
    visibility: VISIBILITIES.find((known) => known === visibility),
    exact: exact === "1" || undefined,
  };
}

export function itemsPath({ kind, tag, page = 1, q, passage, color, visibility, exact }: ItemFilters = {}): string {
  const query = [
    q && `q=${encodeURIComponent(q)}`,
    passage && `passage=${encodeURIComponent(passage)}`,
    kind && `kind=${kind}`,
    tag && `tag=${encodeURIComponent(tag)}`,
    color && `color=${color}`,
    visibility && `visibility=${visibility}`,
    exact && "exact=1",
    page > 1 && `page=${page}`,
  ].filter(Boolean);
  return query.length > 0 ? `/items?${query.join("&")}` : "/items";
}

export const editItemPath = (id: string) => `/items/${id}/edit`;

// Where a post links to another of the owner's items ("My content" in the
// editor inserts it). One stable address whatever the item's permalink
// becomes: today it opens the editor for the owner and is not found for
// anyone else; the public site (M9) can send visitors on to the item's
// permalink from here.
export const itemLinkPath = (id: string) => `/items/${id}`;

export type WriteLocation = {
  kind?: "reflection" | "note";
  // A note's verses, as the reader's `v` has them, and the translation they
  // were read in.
  v?: string;
  tr?: string;
  // Where to go back to: a path on this site.
  back?: string;
};

export function writePath({ kind = "reflection", v, tr, back }: WriteLocation = {}): string {
  const query = new URLSearchParams();
  if (kind === "note") query.set("kind", "note");
  if (kind === "note" && v) query.set("v", v);
  if (kind === "note" && v && tr) query.set("tr", tr);
  if (back) query.set("back", back);
  const search = query.toString().replace(/%2F/g, "/").replace(/%2C/g, ",").replace(/%3B/g, ";");
  return search ? `/write?${search}` : "/write";
}
