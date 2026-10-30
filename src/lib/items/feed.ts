import type { Db } from "@/db/client";
import { getPassages, type Translation } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRecord } from "@/lib/bible/types";
import type { VerseRange } from "@/lib/bible/verse-id";
import type { ShareAlikeSource } from "@/lib/ask/sources";
import { readerPath, translationParam } from "@/lib/reader-url";

import { CARD_CHARS } from "./card-length";
import { findTranslation, parseDocument } from "./cards";
import { renderMarkdown } from "./markdown";
import type { Item } from "./queries";
import { shareAlikeQuotes } from "./share-alike";

// Items made ready to print: what <FeedItem> (src/components/items) takes.
// A highlight is its passage; a note is its passage, when it has one, and its
// text; a reflection is its Markdown with a card wherever it embeds a passage.
// loadFeedEntries() reads the verses of every card of a list of items in one
// query per translation.
//
// Nothing here decides who may see an item: the caller chooses the items.

export { CARD_CHARS };

// A verse as stored, with its breaks and red letters, for the card to lay out
// as the reader does (layoutPassage in src/lib/bible/layout.ts).
export type CardVerse = VerseRecord;

export type PassageCardView = {
  ranges: VerseRange[];
  reference: string;
  // The translation it is quoted in; undefined when none is loaded.
  translation?: Translation;
  // The verses of each run that has any.
  runs: CardVerse[][];
  // Whether verses were left out to keep the card short.
  more: boolean;
  // The passage in the reader, in that translation.
  href: string;
};

export type FeedBlock =
  | { type: "html"; html: string }
  | { type: "card"; card: PassageCardView }
  // A card whose reference does not parse: the line, and why.
  | { type: "bad-card"; source: string; error: string };

export type FeedEntry = {
  item: Item;
  // The passage a highlight or a note is on.
  passage?: PassageCardView;
  // The body of a reflection or a note.
  blocks: FeedBlock[];
  // The translations quoted, each once: their attributions are owed.
  translations: Translation[];
  // The share-alike sources its Markdown quotes: their notices are owed.
  shareAlike: ShareAlikeSource[];
};

type CardRequest = { ranges: VerseRange[]; translation?: Translation; view?: PassageCardView };

function cut(runs: readonly (readonly VerseRecord[])[]) {
  const shown: CardVerse[][] = [];
  let length = 0;
  let more = false;
  for (const run of runs) {
    const verses: CardVerse[] = [];
    for (const verse of run) {
      if (length > 0 && length + verse.text.length > CARD_CHARS) {
        more = true;
        break;
      }
      verses.push(verse);
      length += verse.text.length;
    }
    if (verses.length > 0) shown.push(verses);
    if (more) break;
  }
  return { runs: shown, more };
}

// `translations` is every loaded translation with the site's default first
// (listTranslations(db, defaultId)).
export async function loadFeedEntries(
  db: Db,
  items: readonly Item[],
  { translations, defaultId }: { translations: readonly Translation[]; defaultId: string },
): Promise<FeedEntry[]> {
  const requests: CardRequest[] = [];
  const request = (ranges: VerseRange[], translation: Translation | undefined) => {
    const made: CardRequest = { ranges, translation: translation ?? translations[0] };
    requests.push(made);
    return made;
  };

  const drafts = items.map((item) => {
    // The translation its passages were read in, while that is still loaded.
    const readIn = item.passages.find((passage) => passage.translationId)?.translationId;
    const anchor =
      item.kind !== "reflection" && item.passages.length > 0
        ? request(
            item.passages.map(({ start, end }) => ({ start, end })),
            translations.find((translation) => translation.id === readIn),
          )
        : undefined;
    const body =
      item.kind === "highlight" || !item.markdown
        ? []
        : item.kind === "note"
          ? [{ type: "markdown" as const, text: item.markdown }]
          : parseDocument(item.markdown);
    const blocks = body.map((segment) => {
      if (segment.type === "markdown") {
        return { type: "html" as const, html: renderMarkdown(segment.text) };
      }
      if (!segment.ranges) {
        return {
          type: "bad-card" as const,
          source: segment.source,
          error: segment.error ?? "That reference could not be read.",
        };
      }
      return {
        type: "card" as const,
        request: request(segment.ranges, findTranslation(segment.translation, translations)),
      };
    });
    return { item, anchor, blocks };
  });

  // One query per translation, for all of its cards.
  for (const translation of new Set(requests.map((made) => made.translation))) {
    const mine = requests.filter((made) => made.translation === translation);
    const passages = translation
      ? ((
          await getPassages(
            db,
            [translation.id],
            mine.flatMap((made) => made.ranges),
          )
        ).get(translation.id) ?? [])
      : [];
    let at = 0;
    for (const made of mine) {
      made.view = {
        ranges: made.ranges,
        reference: formatReference(made.ranges),
        translation,
        ...cut(passages.slice(at, at + made.ranges.length)),
        href: readerPath(made.ranges, translation && translationParam([translation.id], defaultId)),
      };
      at += made.ranges.length;
    }
  }

  return drafts.map(({ item, anchor, blocks }) => {
    const done: FeedBlock[] = blocks.map((block) =>
      block.type === "card" ? { type: "card", card: block.request.view! } : block,
    );
    const cards = [
      ...(anchor ? [anchor.view!] : []),
      ...done.flatMap((block) => (block.type === "card" ? [block.card] : [])),
    ];
    const quoted = new Set(
      cards.flatMap((card) => (card.translation && card.runs.length > 0 ? [card.translation] : [])),
    );
    return {
      item,
      passage: anchor?.view,
      blocks: done,
      translations: translations.filter((translation) => quoted.has(translation)),
      shareAlike: item.kind === "highlight" ? [] : shareAlikeQuotes(item.markdown),
    };
  });
}
