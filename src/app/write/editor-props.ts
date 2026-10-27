import { cookies } from "next/headers";

import type { PostEditorProps } from "@/components/editor/post-editor";
import type { Db } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { loadPassage, translationInfo } from "@/lib/editor/passage-data";
import { STUDY_COOKIE, passageKey, type PassageData } from "@/lib/editor/types";
import { itemsPath } from "@/lib/items-url";
import { parseDocument } from "@/lib/items/cards";
import type { Item } from "@/lib/items/queries";
import { formatTags } from "@/lib/items/tags";
import { getDefaultTranslationId } from "@/lib/site";

// What the editor page hands <PostEditor>: the post as saved, the verses of
// its cards (so it opens printed), the verses a note is on, the
// translations, and where "back" goes. /write and /items/<id>/edit share it.

type EditorPageInput = {
  item?: Item;
  kind: "reflection" | "note";
  // A new note's verses, selected in the reader, and the translation read.
  anchor?: { v: string; ranges: VerseRange[]; translationId?: string };
  // A path on this site to go back to.
  back?: string;
};

function backLink(back: string | undefined, kind: "reflection" | "note") {
  if (!back) return { href: itemsPath(), label: "My items" };
  return {
    href: back,
    label: back.startsWith("/read") ? "Reader" : back.startsWith("/items") ? "My items" : "Back",
    afterPost: kind === "note",
  };
}

export async function editorProps(db: Db, { item, kind, anchor, back }: EditorPageInput): Promise<PostEditorProps> {
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const context = { translations, defaultId };
  const markdown = item?.markdown ?? "";

  // The verses of every card, as the blocks will ask for them.
  const passages: Record<string, PassageData> = {};
  if (kind === "reflection") {
    const cards = parseDocument(markdown).flatMap((segment) => (segment.type === "card" ? [segment] : []));
    await Promise.all(
      cards.map(async (card) => {
        passages[passageKey(card.reference, card.translation, "card")] = await loadPassage(
          db,
          { reference: card.reference, translation: card.translation, for: "card" },
          context,
        );
      }),
    );
  }

  // What a note is on.
  const ranges = item ? item.passages : anchor?.ranges;
  const readIn = item ? item.passages.find((range) => range.translationId)?.translationId : anchor?.translationId;
  const noteAnchor =
    kind === "note" && ranges && ranges.length > 0
      ? {
          v: anchor?.v ?? "",
          translationId: readIn ?? "",
          reference: formatReference(ranges),
          passage: await loadPassage(
            db,
            { reference: formatReference(ranges), translation: readIn, for: "card" },
            context,
          ),
        }
      : undefined;

  const firstCard = parseDocument(markdown).find((segment) => segment.type === "card");
  const studyCookie = (await cookies()).get(STUDY_COOKIE)?.value;
  return {
    id: item?.id,
    kind,
    saved: { title: item?.title ?? "", markdown, tags: formatTags(item?.tags ?? []) },
    savedAt: item?.updatedAt.toISOString(),
    visibility: item?.visibility ?? "private",
    publishedAt: item?.publishedAt?.toISOString() ?? null,
    translations: translations.map(translationInfo),
    passages,
    anchor: noteAnchor,
    back: backLink(back, kind),
    // Open unless closed in this browser; a note starts with it closed.
    studyOpen: studyCookie ? studyCookie === "open" : kind === "reflection",
    reading: noteAnchor?.reference ?? (firstCard?.type === "card" ? firstCard.reference : undefined),
  };
}
