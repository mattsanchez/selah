"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { scheduleItemEmbedding } from "@/lib/embeddings/items";
import { editItemPath, itemsPath } from "@/lib/items-url";
import { documentPassages, passageCard } from "@/lib/items/cards";
import {
  createItem,
  deleteItem,
  getItem,
  saveItemContent,
  setVisibility,
  type ItemVisibility,
} from "@/lib/items/queries";
import {
  MAX_ITEM_PASSAGES,
  isVisibility,
  parsePassages,
  validateContent,
  validateNotePost,
  type ContentField,
} from "@/lib/items/validate";
import type { Errors } from "@/lib/settings/validate";

// Writing reflections and notes, and sharing items of every kind. Each action
// starts with requireOwner(): the forms are only rendered for the owner, but
// an action can be called by anyone who can reach the site.

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Items show in the reader, in "My highlights" and in "My items".
function revalidateItems(): void {
  revalidatePath("/", "layout");
}

// "Reflect": starts a reflection and opens it in the editor. With verses
// selected in the reader (`v`, read in `translationId`) the draft starts with
// their passage card.
export async function createReflectionAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const db = getDb();
  const translations = await listTranslations(db);

  const passages = text(form, "v").trim() ? parsePassages(text(form, "v")) : undefined;
  const readIn = translations.find((translation) => translation.id === text(form, "translationId"));
  const markdown = passages ? passageCard(passages, readIn?.abbrev) : "";

  const id = await createItem(db, {
    ownerId: owner.id,
    kind: "reflection",
    markdown,
    passages: documentPassages(markdown, translations),
  });
  revalidateItems();
  redirect(editItemPath(id));
}

const GONE = "This item no longer exists. It may have been deleted in another tab.";
const TOO_MANY_PASSAGES = `A reflection can embed up to ${MAX_ITEM_PASSAGES} separate passages.`;

export type DraftInput = {
  kind: "reflection" | "note";
  title: string;
  markdown: string;
  tags: string;
  // A note written on verses selected in the reader: them (`v`, as the
  // reader's parameter has them) and the translation they were read in.
  v?: string;
  translationId?: string;
};

export type CreateResult =
  | { ok: true; id: string; savedAt: string }
  | { ok: false; errors?: Errors<ContentField>; formError?: string };

// What the editor's autosave calls the first time it saves a new post
// (/write): makes it, private, as a reflection with the passages of its cards
// or a note on the verses it was written on. Saves after that go to
// saveItemAction.
export async function createDraftAction(input: DraftInput): Promise<CreateResult> {
  const owner = await requireOwner();
  const { kind, title, markdown, tags, v = "", translationId = "" } = input ?? {};
  if (
    (kind !== "reflection" && kind !== "note") ||
    [title, markdown, tags, v, translationId].some((value) => typeof value !== "string")
  ) {
    return { ok: false, formError: "That could not be saved." };
  }

  const db = getDb();
  const translations = await listTranslations(db);
  let id: string;
  if (kind === "reflection") {
    const valid = validateContent({ title, markdown, tags }, "reflection");
    if (!valid.ok) return { ok: false, errors: valid.errors };
    const passages = documentPassages(valid.value.markdown, translations);
    if (passages.length > MAX_ITEM_PASSAGES) return { ok: false, errors: { markdown: TOO_MANY_PASSAGES } };
    id = await createItem(db, { ownerId: owner.id, kind, ...valid.value, passages });
  } else {
    const valid = validateNotePost(
      { markdown, tags, visibility: "private", v, translationId },
      translations.map((translation) => translation.id),
    );
    if (!valid.ok) return { ok: false, errors: valid.errors };
    id = await createItem(db, { ownerId: owner.id, kind, ...valid.value });
  }
  scheduleItemEmbedding(id);
  const created = await getItem(db, { ownerId: owner.id, id });
  return { ok: true, id, savedAt: (created?.updatedAt ?? new Date()).toISOString() };
}

export type SaveResult =
  // `savedAt` is the item's `updated_at`, as an ISO string.
  | { ok: true; savedAt: string }
  | { ok: false; errors?: Errors<ContentField>; formError?: string };


// What the editor's autosave calls: saves a reflection's title, Markdown and
// tags (or a note's Markdown and tags). A reflection's passages are read from
// the cards in its Markdown, so `item_passage` always matches the document.
export async function saveItemAction(input: {
  id: string;
  title: string;
  markdown: string;
  tags: string;
}): Promise<SaveResult> {
  const owner = await requireOwner();
  const { id, title, markdown, tags } = input ?? {};
  if ([id, title, markdown, tags].some((value) => typeof value !== "string") || !UUID.test(id)) {
    return { ok: false, formError: GONE };
  }

  const db = getDb();
  const ref = { ownerId: owner.id, id };
  const existing = await getItem(db, ref);
  if (!existing || existing.kind === "highlight") return { ok: false, formError: GONE };

  const valid = validateContent({ title, markdown, tags }, existing.kind);
  if (!valid.ok) return { ok: false, errors: valid.errors };

  // A note stays on the verses it was written on.
  const passages =
    existing.kind === "reflection"
      ? documentPassages(valid.value.markdown, await listTranslations(db))
      : undefined;
  if (passages && passages.length > MAX_ITEM_PASSAGES) {
    return { ok: false, errors: { markdown: TOO_MANY_PASSAGES } };
  }

  // Nothing on screen is rendered from what is saved: the editor is the
  // page. The owner's other pages are rendered afresh when opened.
  const savedAt = await saveItemContent(db, ref, { ...valid.value, passages });
  if (!savedAt) return { ok: false, formError: GONE };
  scheduleItemEmbedding(id);
  return { ok: true, savedAt: savedAt.toISOString() };
}

export type PublishResult =
  | { ok: true; visibility: ItemVisibility; publishedAt: string | null }
  | { ok: false; formError: string };

// The editor's "Publish" (or a note's "Post"), and changing who may see a
// reflection or a note from there: as setVisibilityAction, but answering
// with what the item now is.
export async function publishItemAction(input: {
  id: string;
  visibility: string;
}): Promise<PublishResult> {
  const owner = await requireOwner();
  const { id, visibility } = input ?? {};
  if (typeof id !== "string" || !UUID.test(id) || !isVisibility(visibility)) {
    return { ok: false, formError: GONE };
  }
  const db = getDb();
  const ref = { ownerId: owner.id, id };
  const existing = await getItem(db, ref);
  if (!existing || existing.kind === "highlight" || !(await setVisibility(db, ref, visibility))) {
    return { ok: false, formError: GONE };
  }
  const now = await getItem(db, ref);
  return {
    ok: true,
    visibility,
    publishedAt: now?.publishedAt?.toISOString() ?? null,
  };
}

// "Share" and "Unshare" on a highlight, "Publish" and "Unpublish" on a
// reflection or a note: makes the item private, unlisted or public where it
// is. The page it was submitted from is rendered again.
export async function setVisibilityAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = text(form, "id");
  const visibility = text(form, "visibility");
  if (UUID.test(id) && isVisibility(visibility)) {
    await setVisibility(getDb(), { ownerId: owner.id, id }, visibility);
  }
  revalidateItems();
}

// Deletes a reflection or a note, from the editor, and returns to the list.
export async function deleteItemAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = text(form, "id");
  if (UUID.test(id)) await deleteItem(getDb(), { ownerId: owner.id, id });
  revalidateItems();
  redirect(itemsPath());
}
