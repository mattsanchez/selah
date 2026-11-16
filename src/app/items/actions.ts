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
import { findUncredited, type UncreditedMatch } from "@/lib/items/uncredited";
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
const CHANGED =
  "This post was changed in another tab or on another device. Your text here is kept in this browser and has not been saved.";

// A save's token: what the editor makes, a UUID.
const isToken = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
// How many tokens a save may say it builds on: the one it knows was saved,
// and the few sent since whose answers never came.
const MAX_AFTER = 32;
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
  // The save's token (see `item.save_token`).
  token?: string;
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
  const { kind, title, markdown, tags, v = "", translationId = "", token } = input ?? {};
  if (
    (kind !== "reflection" && kind !== "note") ||
    [title, markdown, tags, v, translationId].some((value) => typeof value !== "string") ||
    (token !== undefined && !isToken(token))
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
    id = await createItem(db, { ownerId: owner.id, kind, ...valid.value, passages, saveToken: token });
  } else {
    const valid = validateNotePost(
      { markdown, tags, visibility: "private", v, translationId },
      translations.map((translation) => translation.id),
    );
    if (!valid.ok) return { ok: false, errors: valid.errors };
    id = await createItem(db, { ownerId: owner.id, kind, ...valid.value, saveToken: token });
  }
  scheduleItemEmbedding(id);
  const created = await getItem(db, { ownerId: owner.id, id });
  return { ok: true, id, savedAt: (created?.updatedAt ?? new Date()).toISOString() };
}

export type SaveResult =
  // `savedAt` is the item's `updated_at`, as an ISO string.
  | { ok: true; savedAt: string }
  // The text was saved from somewhere else since the save this one builds
  // on (`token` is that save's): nothing was written.
  | { ok: false; conflict: true; token: string | null; formError: string; errors?: undefined }
  | { ok: false; conflict?: undefined; errors?: Errors<ContentField>; formError?: string };


// What the editor's autosave calls: saves a reflection's title, Markdown and
// tags (or a note's Markdown and tags). A reflection's passages are read from
// the cards in its Markdown, so `item_passage` always matches the document.
//
// `token` is this save's and `after` the saves it builds on (see
// `item.save_token`): it is refused, as a conflict, when the item's text is
// from any other. Without them it is saved whatever is there.
export async function saveItemAction(input: {
  id: string;
  title: string;
  markdown: string;
  tags: string;
  token?: string;
  after?: (string | null)[];
}): Promise<SaveResult> {
  const owner = await requireOwner();
  const { id, title, markdown, tags, token, after } = input ?? {};
  if ([id, title, markdown, tags].some((value) => typeof value !== "string") || !UUID.test(id)) {
    return { ok: false, formError: GONE };
  }
  const lineage =
    token === undefined && after === undefined
      ? undefined
      : isToken(token) &&
          Array.isArray(after) &&
          after.length > 0 &&
          after.length <= MAX_AFTER &&
          after.every((base) => base === null || isToken(base))
        ? { token, after }
        : null;
  if (lineage === null) return { ok: false, formError: "That could not be saved." };

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
  const saved = await saveItemContent(db, ref, { ...valid.value, passages }, lineage);
  if (!saved.ok) {
    return saved.conflict
      ? { ok: false, conflict: true, token: saved.token, formError: CHANGED }
      : { ok: false, formError: GONE };
  }
  scheduleItemEmbedding(id);
  return { ok: true, savedAt: saved.savedAt.toISOString() };
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

export type UncreditedResult =
  // `checked` is false when the notes are not in the database to compare.
  | { ok: true; checked: boolean; matches: UncreditedMatch[] }
  | { ok: false };

// Whether a saved reflection or note has words of a share-alike source's
// notes outside a quote that credits it (src/lib/items/uncredited.ts). The
// editor asks before publishing and after saving a published post, and only
// warns: nothing here changes the post or stops it being published. It reads
// what is saved, which is what the public site prints. A failure answers
// `ok: false`, and the editor carries on as if it had found nothing.
export async function checkUncreditedAction(input: { id: string }): Promise<UncreditedResult> {
  const owner = await requireOwner();
  const id = input?.id;
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false };
  try {
    const db = getDb();
    const item = await getItem(db, { ownerId: owner.id, id });
    if (!item || item.kind === "highlight") return { ok: false };
    return { ok: true, ...(await findUncredited(db, item.markdown)) };
  } catch (error) {
    console.error("Could not check the post for uncredited quotations", error);
    return { ok: false };
  }
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
