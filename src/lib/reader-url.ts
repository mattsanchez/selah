import { referenceSlug } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";

// The reader's URLs.
//
//   /read                        the reference box
//   /read?q=jn3.16               what the box submits; redirects to the next
//   /read/john-3.16              a passage in the default translation
//   /read/john-3.16?t=web        ... in another translation
//   /read/john-3.16?t=bsb,web    ... in two to four, side by side
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

export function readerPath(ranges: readonly VerseRange[], t?: string): string {
  // "," and ";" are legal in a path segment and read better left as they are.
  const path = `/read/${referenceSlug(ranges)}`;
  return t ? `${path}?t=${t}` : path;
}
