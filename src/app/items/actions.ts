"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { parseReference } from "@/lib/bible/reference";
import { editItemPath, itemsPath } from "@/lib/items-url";
import { documentPassages, passageCard } from "@/lib/items/cards";
import {
  createItem,
  deleteItem,
  getItem,
  saveItemContent,
  setVisibility,
} from "@/lib/items/queries";
import {
  MAX_ITEM_PASSAGES,
  isVisibility,
  parsePassages,
  validateContent,
  validateNotePost,
  type ContentField,
} from "@/lib/items/validate";
import { readerPath } from "@/lib/reader-url";
import { readerTranslations } from "@/lib/search-url";
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
  const markdown = passages ? `${passageCard(passages, readIn?.abbrev)}\n\n` : "";

  const id = await createItem(db, {
    ownerId: owner.id,
    kind: "reflection",
    markdown,
    passages: documentPassages(markdown, translations),
  });
  revalidateItems();
  redirect(editItemPath(id));
}

export type NoteState = {
  errors?: Errors<ContentField>;
  // What was submitted, to refill the form after an error.
  values?: { markdown: string; tags: string; visibility: string };
};

// "Note": posts a short item. Written in the reader it is anchored to the
// selected verses and returns to them (the page `p`, its translations `t`);
// written anywhere else it is on no passage and returns to "My items".
export async function createNoteAction(_: NoteState, form: FormData): Promise<NoteState> {
  const owner = await requireOwner();

  const input = {
    markdown: text(form, "markdown"),
    tags: text(form, "tags"),
    visibility: text(form, "visibility"),
    v: text(form, "v"),
    translationId: text(form, "translationId"),
  };
  const values = { markdown: input.markdown, tags: input.tags, visibility: input.visibility };

  const db = getDb();
  const translations = await listTranslations(db);
  const valid = validateNotePost(
    input,
    translations.map((translation) => translation.id),
  );
  if (!valid.ok) return { values, errors: valid.errors };
  const { passages, translationId, markdown, tags, visibility } = valid.value;

  await createItem(db, {
    ownerId: owner.id,
    kind: "note",
    markdown,
    passages,
    translationId,
    tags,
    visibility,
  });
  revalidateItems();

  if (passages.length === 0) redirect(itemsPath());
  const page = parseReference(text(form, "p"));
  redirect(
    readerPath(page.ok ? page.ranges : passages, readerTranslations(text(form, "t")), {
      v: passages,
    }),
  );
}

export type SaveResult =
  // `savedAt` is the item's `updated_at`, as an ISO string.
  | { ok: true; savedAt: string }
  | { ok: false; errors?: Errors<ContentField>; formError?: string };

const GONE = "This item no longer exists. It may have been deleted in another tab.";

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
    return {
      ok: false,
      errors: { markdown: `A reflection can embed up to ${MAX_ITEM_PASSAGES} separate passages.` },
    };
  }

  const savedAt = await saveItemContent(db, ref, { ...valid.value, passages });
  if (!savedAt) return { ok: false, formError: GONE };
  revalidateItems();
  return { ok: true, savedAt: savedAt.toISOString() };
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
