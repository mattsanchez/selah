import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference, referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { editItemPath } from "@/lib/items-url";
import { parseDocument } from "@/lib/items/cards";
import { markdownExcerpt } from "@/lib/items/markdown";
import type { Item } from "@/lib/items/queries";
import { tagSlug } from "@/lib/items/tags";
import { readerPath } from "@/lib/reader-url";

// The public site's URLs. Everything here can be read by anyone; what each
// page lists is decided by the public queries (src/lib/items/public.ts).
//
//   /                              the feed: public items of every kind, newest first
//   /?page=2                       ... ten to a page
//   /p/<slug>-<key>                one item, of any kind ("permalink")
//   /p/<key>                       ... the same; redirects to the one above
//   /tag/<slug>                    the public items with a tag
//   /passage/<reference>           the passage, and the public items on verses
//                                  that overlap it ("everything on Romans 8")
//   /rss.xml, /atom.xml            the feed as RSS 2.0 and as Atom
//   /tag/<slug>/rss.xml, ...       ... of a tag; /passage/<reference>/rss.xml too
//   .../og.png                     the Open Graph image of a page
//   /items/<id>                    an item as a post links to it (itemLinkPath in
//                                  src/lib/items-url.ts): redirects a visitor
//                                  to its permalink (itemLinkTarget below)
//
// A permalink's key is the first twelve hex digits of the item's id: it never
// changes, so a link keeps working whatever happens to the item's title. The
// slug before it is only for people to read (the title of a reflection, the
// words of a note, the reference of a highlight); a permalink with an old or
// a missing slug redirects to the current one.
//
// A passage is written as the reader writes it (referenceSlug(): "romans-8",
// "john-3.16-21"). Anything parseReference() reads works in its place
// ("rom-8", "jn3.16"), and so does "john-3-16-21", and redirects.

export const PUBLIC_PAGE_SIZE = 10;

// How many hex digits of an item's id are its key: 48 random bits.
const KEY_LENGTH = 12;

// "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b" -> "3f9a2c1b7d4e".
export function itemKey(id: string): string {
  return id.replace(/-/g, "").slice(0, KEY_LENGTH).toLowerCase();
}

// The ids an item key stands for, as an inclusive range of uuids.
export function keyIdRange(key: string): { from: string; to: string } {
  const at = (fill: string) => {
    const hex = key.padEnd(32, fill);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  return { from: at("0"), to: at("f") };
}

// What a permalink's path segment says: the key, and the slug written before
// it, if any. Undefined when it is not a permalink.
export function parsePermalink(segment: string): { key: string; slug: string } | undefined {
  const match = /^(?:(.*)-)?([0-9a-f]{12})$/i.exec(segment);
  if (!match) return undefined;
  return { key: match[2].toLowerCase(), slug: match[1] ?? "" };
}

const SLUG_LENGTH = 60;

// A slug of at most SLUG_LENGTH characters, cut between words.
function shortSlug(text: string): string {
  const slug = tagSlug(text);
  if (slug.length <= SLUG_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_LENGTH + 1);
  const end = cut.lastIndexOf("-");
  return end > 0 ? cut.slice(0, end) : slug.slice(0, SLUG_LENGTH);
}

// The words of a reflection or a note without its passage cards.
function bodyText(item: Pick<Item, "kind" | "markdown">): string {
  if (!item.markdown) return "";
  const markdown =
    item.kind === "reflection"
      ? parseDocument(item.markdown)
          .flatMap((segment) => (segment.type === "markdown" ? [segment.text] : []))
          .join("\n\n")
      : item.markdown;
  return markdownExcerpt(markdown, 1000);
}

type Headed = Pick<Item, "kind" | "title" | "markdown" | "note" | "passages">;

// What an item is called where it needs a name: a page's title, a feed
// entry, a link. A reflection by its title; a highlight by its reference; a
// note, and a reflection without a title, by their first words.
export function itemHeadline(item: Headed): string {
  const reference = item.passages.length > 0 ? formatReference(item.passages) : undefined;
  if (item.kind === "reflection" && item.title?.trim()) return item.title.trim();
  if (item.kind === "highlight") return reference ?? "Highlight";
  const words = bodyText(item);
  if (words) return words.length > 80 ? markdownExcerpt(words, 80) : words;
  return reference ?? (item.kind === "note" ? "Note" : "Reflection");
}

// A sentence or two of what the item says, for a description.
export function itemSummary(item: Headed, limit = 200): string {
  if (item.kind === "highlight") return item.note?.trim() ?? "";
  const words = bodyText(item);
  return words.length > limit ? markdownExcerpt(words, limit) : words;
}

export function itemSlug(item: Headed): string {
  return shortSlug(itemHeadline(item));
}

export function permalinkPath(item: Headed & Pick<Item, "id">): string {
  const slug = itemSlug(item);
  const key = itemKey(item.id);
  return `/p/${slug ? `${encodeURIComponent(slug)}-${key}` : key}`;
}

// Where a link to an item by its id (/items/<id>, as the editor's "My
// content" links one post to another) takes whoever follows it. The owner
// goes to the item itself: a reflection or a note to its editor, a highlight
// to its verses in the reader. Anyone else goes to its permalink while it is
// public or unlisted, and nowhere while it is private.
export function itemLinkTarget(
  item: Headed & Pick<Item, "id" | "visibility">,
  { owner }: { owner: boolean },
): string | undefined {
  if (owner) {
    return item.kind === "highlight"
      ? readerPath(item.passages, undefined, { v: item.passages })
      : editItemPath(item.id);
  }
  return item.visibility === "private" ? undefined : permalinkPath(item);
}

const paged = (path: string, page = 1) => (page > 1 ? `${path}?page=${page}` : path);

export const homePath = (page?: number) => paged("/", page);

export const tagPath = (slug: string, page?: number) =>
  paged(`/tag/${encodeURIComponent(slug)}`, page);

export const passagePath = (ranges: readonly VerseRange[], page?: number) =>
  paged(`/passage/${referenceSlug(ranges)}`, page);

export type FeedFormat = "rss" | "atom";

// The feeds of the site, a tag or a passage: the page's path with the file
// after it.
export function feedPath(format: FeedFormat, of: string = "/"): string {
  return `${of === "/" ? "" : of}/${format}.xml`;
}

// A path segment as typed: Next.js passes it to a page still percent-encoded.
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// The page number a `page` parameter asks for; 1 when it asks for none.
export function parsePage(param: string | undefined): number {
  const number = /^\d{1,6}$/.test(param ?? "") ? Number(param) : 1;
  return number > 1 ? number : 1;
}

// The verses a passage page's segment names, or undefined.
export function parsePassage(segment: string): VerseRange[] | undefined {
  const parsed = parseReference(segment);
  if (parsed.ok) return normalizeRanges(parsed.ranges);
  // "john-3-16-21": hyphens throughout, as people write slugs. Chapter and
  // verses, or chapter and verse to chapter and verse.
  const match = /^(.*?[a-z].*?)-(\d{1,3})-(\d{1,3})-(\d{1,3})(?:-(\d{1,3}))?$/i.exec(segment);
  if (!match) return undefined;
  const [, book, chapter, verse, to, toVerse] = match;
  const end = toVerse ? `${to}:${toVerse}` : to;
  const retried = parseReference(`${book} ${chapter}:${verse}-${end}`);
  return retried.ok ? normalizeRanges(retried.ranges) : undefined;
}
