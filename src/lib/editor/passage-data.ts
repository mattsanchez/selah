import { and, desc, eq, gt, lt } from "drizzle-orm";

import type { Db } from "@/db/client";
import { verse } from "@/db/schema";
import { getPassages, type Translation } from "@/lib/bible/passage";
import { normalizeRanges } from "@/lib/bible/ranges";
import { chapterLabel, formatReference, parseReference, referenceSlug } from "@/lib/bible/reference";
import { parseVerseId, type VerseRange } from "@/lib/bible/verse-id";
import { findTranslation } from "@/lib/items/cards";
import { readerPath, translationParam } from "@/lib/reader-url";

import { cutVerses, type ChapterLink, type PassageData, type TranslationInfo } from "./types";

// The verses of a passage for the editor: a passage block shows a card's
// verses as the feed will quote them, and the study sidebar shows a passage
// to read and select from.

export const translationInfo = ({ id, abbrev, name, attribution, sourceUrl }: Translation): TranslationInfo => ({
  id,
  abbrev,
  name,
  attribution,
  sourceUrl,
});

const chapterOf = (verseId: number) => {
  const ref = parseVerseId(verseId)!;
  return { book: ref.book, chapter: ref.chapter };
};

function chapterLink(verseId: number | undefined): ChapterLink | undefined {
  if (verseId === undefined) return undefined;
  const { book, chapter } = chapterOf(verseId);
  const label = chapterLabel(book, chapter);
  const parsed = parseReference(label);
  return { label, slug: parsed.ok ? referenceSlug(parsed.ranges) : label };
}

// The loaded chapters either side of the passage, in this translation.
async function neighbours(db: Db, translationId: string, ranges: readonly VerseRange[]) {
  const first = ranges[0].start;
  const last = ranges.at(-1)!.end;
  const before = Math.floor(first / 1000) * 1000;
  const after = Math.floor(last / 1000) * 1000 + 999;
  const [previous, next] = await Promise.all([
    db
      .select({ verseId: verse.verseId })
      .from(verse)
      .where(and(eq(verse.translationId, translationId), lt(verse.verseId, before)))
      .orderBy(desc(verse.verseId))
      .limit(1),
    db
      .select({ verseId: verse.verseId })
      .from(verse)
      .where(and(eq(verse.translationId, translationId), gt(verse.verseId, after)))
      .orderBy(verse.verseId)
      .limit(1),
  ]);
  return { previous: chapterLink(previous[0]?.verseId), next: chapterLink(next[0]?.verseId) };
}

export type PassageRequest = {
  // Anything the reader's box takes.
  reference: string;
  // An abbreviation or an id; the site's default when absent or unknown.
  translation?: string | null;
  // As a card quotes it (cut short), or the whole passage to read.
  for: "card" | "reading";
};

// `translations` is every loaded translation with the site's default first
// (listTranslations(db, defaultId)).
export async function loadPassage(
  db: Db,
  request: PassageRequest,
  { translations, defaultId }: { translations: readonly Translation[]; defaultId: string },
): Promise<PassageData> {
  const parsed = parseReference(request.reference.trim());
  if (!parsed.ok) return { ok: false, error: parsed.error.message };
  const translation = findTranslation(request.translation ?? undefined, translations) ?? translations[0];
  if (!translation) return { ok: false, error: "No translations are loaded." };

  const ranges = normalizeRanges(parsed.ranges);
  const all = (await getPassages(db, [translation.id], ranges)).get(translation.id) ?? [];
  if (all.every((run) => run.length === 0)) {
    return { ok: false, error: `${formatReference(ranges)} is not in the ${translation.abbrev} as loaded here.` };
  }
  const { verses, more } = request.for === "card" ? cutVerses(all) : { verses: all, more: false };
  return {
    ok: true,
    reference: formatReference(ranges),
    ranges,
    translation: translationInfo(translation),
    verses,
    more,
    href: readerPath(ranges, translationParam([translation.id], defaultId)),
    ...(request.for === "reading" ? await neighbours(db, translation.id, ranges) : {}),
  };
}
