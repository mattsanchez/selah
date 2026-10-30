import type { Translation } from "@/lib/bible/passage";
import type { VerseRecord } from "@/lib/bible/types";
import type { SearchMode } from "@/lib/bible/search";
import type { VerseRange } from "@/lib/bible/verse-id";
import type { RelatedResult } from "@/lib/embeddings/related";
import { CARD_CHARS } from "@/lib/items/card-length";
import type { HighlightColorId } from "@/lib/items/palette";
import type { ItemKind, ItemVisibility } from "@/lib/items/queries";
import type { TagName } from "@/lib/items/tags";

// What the editor and its study sidebar get from the server
// (src/app/api/editor/*), as JSON. Shared by the routes and the client.

// What is printed with a translation's text: its name and its attribution.
export type TranslationInfo = Pick<
  Translation,
  "id" | "abbrev" | "name" | "attribution" | "sourceUrl"
>;

// A chapter next to the one being read, by its label: "John 4".
export type ChapterLink = { label: string; slug: string };

export type PassageData =
  | {
      ok: true;
      // As formatReference() writes it: "John 3:16-18".
      reference: string;
      ranges: VerseRange[];
      translation: TranslationInfo;
      // The verses of each range, as getPassages() returns them. A card is
      // cut after about CARD_CHARS characters, as the feed cuts it.
      verses: VerseRecord[][];
      // Whether verses were left out to keep a card short.
      more: boolean;
      // The passage in the reader.
      href: string;
      // For reading on: the chapters before and after, where they are loaded.
      previous?: ChapterLink;
      next?: ChapterLink;
    }
  | {
      ok: false;
      // Why the passage cannot be shown, for the writer.
      error: string;
    };

export type SearchHitView = {
  verseId: number;
  // The last verse, when the hit is a passage of several.
  endVerseId?: number;
  // The whole hit: "John 14:1-4".
  reference: string;
  translationId: string;
  text: { text: string; match: boolean }[];
};

export type SearchData = {
  hits: SearchHitView[];
  total: number;
  searchable: boolean;
  // How the hits were ranked. "keyword" also when another mode was asked for
  // and could not be used.
  mode: SearchMode;
};

// Passages related to one, for the sidebar's "Related".
export type RelatedData = RelatedResult & {
  // The passage they are related to, as formatReference() writes it.
  reference: string;
  // The translation they are quoted in.
  translation: TranslationInfo;
};

// One of the owner's items in "My content".
export type ContentItem = {
  id: string;
  kind: ItemKind;
  visibility: ItemVisibility;
  // ISO.
  createdAt: string;
  title: string | null;
  // The words of a reflection or a note, cut short.
  excerpt: string;
  // A highlight's color and note.
  color: HighlightColorId | null;
  note: string | null;
  // The passage it is on, and the translation it was read in (an
  // abbreviation), when it is on one.
  reference: string | null;
  translation: string | null;
  tags: TagName[];
};

export type ContentData = {
  items: ContentItem[];
  total: number;
  tags: TagName[];
  // Whether a search can also go by meaning here.
  meaning: boolean;
};

// The key a passage is known by on the client: which use, which reference
// as written, in which translation as named.
export const passageKey = (
  reference: string,
  translation: string | null | undefined,
  use: "card" | "reading",
) => `${use}|${reference.trim().toLowerCase()}|${(translation ?? "").trim().toLowerCase()}`;

// Keeps the verses up to about CARD_CHARS characters, as loadFeedEntries()
// does, and says whether any were left out. The first verse always stays.
export function cutVerses(runs: readonly VerseRecord[][]): { verses: VerseRecord[][]; more: boolean } {
  const verses: VerseRecord[][] = [];
  let length = 0;
  for (const run of runs) {
    const kept: VerseRecord[] = [];
    for (const record of run) {
      if (length > 0 && length + record.text.length > CARD_CHARS) {
        if (kept.length > 0) verses.push(kept);
        return { verses, more: true };
      }
      kept.push(record);
      length += record.text.length;
    }
    verses.push(kept);
  }
  return { verses, more: false };
}

// The cookie that remembers whether the study sidebar is open, per browser:
// "open" or "closed".
export const STUDY_COOKIE = "selah-study";
