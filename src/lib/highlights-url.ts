import { findBook } from "@/lib/bible/book-names";
import type { Book } from "@/lib/bible/books";
import { isHighlightColor, type HighlightColorId } from "@/lib/items/palette";
import { bookSlug, parsePage } from "@/lib/search-url";

// The URLs of "My highlights". The filters are in the query, so a filtered
// list can be bookmarked and the back button undoes a filter.
//
//   /highlights                          every highlight, newest first
//   /highlights?color=yellow             ... of one color
//   /highlights?book=john                ... on one book
//   /highlights?from=2026-10-01          ... made on or after a day
//   /highlights?to=2026-10-13            ... made on or before a day
//   /highlights?page=2                   the second page

export const HIGHLIGHTS_PAGE_SIZE = 20;

export type HighlightFilters = {
  color?: HighlightColorId;
  book?: Book;
  // Days as "2026-10-13".
  from?: string;
  to?: string;
  page?: number;
};

// A day as a date input submits it, if it is a day of the calendar.
export function parseDay(param: string | undefined): string | undefined {
  const value = param?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
}

type Params = Partial<Record<"color" | "book" | "from" | "to" | "page", string | undefined>>;

// The filters a query asks for; anything it does not understand is no filter.
export function parseHighlightFilters(params: Params): HighlightFilters {
  const color = params.color?.trim().toLowerCase();
  const bookName = params.book?.trim().replace(/-/g, " ");
  let from = parseDay(params.from);
  let to = parseDay(params.to);
  // Days typed the wrong way round still mean the days between them.
  if (from && to && from > to) [from, to] = [to, from];
  const page = parsePage(params.page);
  return {
    ...(isHighlightColor(color) ? { color } : {}),
    ...(bookName ? { book: findBook(bookName).book } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(page > 1 ? { page } : {}),
  };
}

export function highlightsPath({ color, book, from, to, page = 1 }: HighlightFilters = {}): string {
  const params = new URLSearchParams();
  if (color) params.set("color", color);
  if (book) params.set("book", bookSlug(book));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/highlights?${query}` : "/highlights";
}

export const hasFilters = ({ color, book, from, to }: HighlightFilters) =>
  Boolean(color || book || from || to);
