import { referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";

// The reader's URLs.
//
//   /read                        the reference box
//   /read?q=jn3.16               what the box submits; redirects to the next
//   /read/john-3.16              a passage in the default translation
//   /read/john-3.16?t=web        ... in another translation
//   /read/john-3.16?t=bsb,web    ... in two to four, side by side
//   /read/john-3?v=john-3.16     ... with a verse selected: the study panel
//   /read/john-3?v=john-3.16-18,20   ... with several: a highlight is made of them
//   ...&add=1                    ... while a click adds or removes a verse
//   ...&full=matthew-henry       ... and one source's entries printed in full
//   ...?ask=1                    ... with the panel for asking about it (the owner's)
//
// The path segment is referenceSlug(); anything parseReference() reads works
// in its place and redirects to the canonical slug.

// The parallel view shows at most this many translations.
export const MAX_TRANSLATIONS = 4;

// The translations a `t` parameter asks for, in its order: known ids only,
// each once, at most MAX_TRANSLATIONS. The default translation when it names
// none.
export function selectTranslations(
  param: string | undefined,
  available: readonly string[],
  defaultId: string,
): string[] {
  const asked = (param ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id, i, ids) => available.includes(id) && ids.indexOf(id) === i)
    .slice(0, MAX_TRANSLATIONS);
  if (asked.length > 0) return asked;
  return available.includes(defaultId) ? [defaultId] : available.slice(0, 1);
}

// The `t` parameter for a selection; undefined for the default translation
// alone, which needs none.
export function translationParam(
  selected: readonly string[],
  defaultId: string,
): string | undefined {
  if (selected.length === 0) return undefined;
  if (selected.length === 1 && selected[0] === defaultId) return undefined;
  return selected.join(",");
}

// What a reader URL carries besides the passage and its translations.
export type ReaderState = {
  // The selected verses (see src/lib/verse-selection.ts).
  v?: readonly VerseRange[];
  // A click on a verse adds it to the selection or removes it, rather than
  // selecting it alone. Only with a selection.
  add?: boolean;
  // The commentary source the study panel prints in full.
  full?: string;
  // The Ask panel is open.
  ask?: boolean;
};

export function readerPath(
  ranges: readonly VerseRange[],
  t?: string,
  { v = [], add, full, ask }: ReaderState = {},
): string {
  // "," and ";" are legal in a path segment and in a query, and read better
  // left as they are.
  const query = [
    t && `t=${t}`,
    v.length > 0 && `v=${referenceSlug(v)}`,
    v.length > 0 && add && "add=1",
    v.length > 0 && full && `full=${encodeURIComponent(full)}`,
    ask && "ask=1",
  ].filter(Boolean);
  const path = `/read/${referenceSlug(ranges)}`;
  return query.length > 0 ? `${path}?${query.join("&")}` : path;
}
