// Tags, as they are typed and as they are stored. Pure functions; the tables
// are read and written in ./queries.ts.
//
// A tag has a name, kept as it was first typed ("Holy Spirit"), and a slug
// ("holy-spirit") that decides whether two spellings are the same tag and
// that a URL can carry:
//
// - the name: a leading "#" dropped, runs of whitespace made one space;
// - the slug: the name in lower case without accents, every run of anything
//   but letters and digits (of any script) made one hyphen.
//
// A form sends an item's tags as one string, separated by commas.

// What an item can carry, and how long a tag's name can be.
export const MAX_ITEM_TAGS = 10;
export const MAX_TAG_LENGTH = 40;

export type TagName = { slug: string; name: string };

export function tagSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// One tag as typed; undefined when nothing of it would be left.
export function normalizeTag(typed: string): TagName | undefined {
  const name = typed.normalize("NFC").replace(/\s+/g, " ").trim().replace(/^#+\s*/, "");
  const slug = tagSlug(name);
  return slug ? { slug, name } : undefined;
}

export type ParsedTags = { ok: true; tags: TagName[] } | { ok: false; error: string };

// The tags a form names ("grace, Holy Spirit, #Romans"), each once, in the
// order typed. Commas with nothing between them are ignored.
export function parseTags(typed: string): ParsedTags {
  const tags: TagName[] = [];
  for (const part of typed.split(/[,\n]/)) {
    const tag = normalizeTag(part);
    if (!tag) continue;
    if (tag.name.length > MAX_TAG_LENGTH) {
      return { ok: false, error: `Keep each tag to ${MAX_TAG_LENGTH} characters.` };
    }
    if (!tags.some((other) => other.slug === tag.slug)) tags.push(tag);
  }
  if (tags.length > MAX_ITEM_TAGS) {
    return { ok: false, error: `An item can have up to ${MAX_ITEM_TAGS} tags; this has ${tags.length}.` };
  }
  return { ok: true, tags };
}

// Tags as a form's field shows them.
export const formatTags = (tags: readonly { name: string }[]) =>
  tags.map((tag) => tag.name).join(", ");
