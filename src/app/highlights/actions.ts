"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { parseReference } from "@/lib/bible/reference";
import { createItem, deleteItem, hasVerses, updateItem } from "@/lib/items/queries";
import {
  validateHighlightEdit,
  validateNewHighlight,
  type HighlightField,
} from "@/lib/items/validate";
import { readerPath } from "@/lib/reader-url";
import { readerTranslations } from "@/lib/search-url";
import type { Errors } from "@/lib/settings/validate";

// Writing highlights. Each action starts with requireOwner(): the forms are
// only rendered for the owner, but an action can be called by anyone who can
// reach the site.

export type HighlightState = {
  errors?: Errors<HighlightField>;
  formError?: string;
  saved?: boolean;
  // What was submitted, to refill the form after an error.
  values?: { color: string; note: string };
};

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const GONE = "That highlight no longer exists. It may have been deleted in another tab.";

// The reader and "My highlights" both show highlights; so will the feed.
function revalidateHighlights(): void {
  revalidatePath("/", "layout");
}

// Highlights the verses selected in the reader, then returns to the passage
// (`p`, with its translations `t`) with nothing selected, so the highlight is
// what shows.
export async function createHighlightAction(
  _: HighlightState,
  form: FormData,
): Promise<HighlightState> {
  const owner = await requireOwner();

  const input = {
    v: text(form, "v"),
    color: text(form, "color"),
    note: text(form, "note"),
    translationId: text(form, "translationId"),
  };
  const values = { color: input.color, note: input.note };

  const db = getDb();
  const translations = await listTranslations(db);
  const valid = validateNewHighlight(
    input,
    translations.map((translation) => translation.id),
  );
  if (!valid.ok) {
    return { values, errors: valid.errors, formError: valid.errors.passage };
  }
  const { passages, translationId, color, note } = valid.value;
  if (!(await hasVerses(db, passages))) {
    return { values, formError: "None of the translations loaded here has those verses." };
  }

  await createItem(db, {
    ownerId: owner.id,
    kind: "highlight",
    passages,
    translationId,
    color,
    note,
  });
  revalidateHighlights();

  const page = parseReference(text(form, "p"));
  redirect(readerPath(page.ok ? page.ranges : passages, readerTranslations(text(form, "t"))));
}

// Changes a highlight's color and note, where it is: the page it was
// submitted from is rendered again.
export async function updateHighlightAction(
  _: HighlightState,
  form: FormData,
): Promise<HighlightState> {
  const owner = await requireOwner();

  const input = { color: text(form, "color"), note: text(form, "note") };
  const id = text(form, "id");
  const valid = validateHighlightEdit(input);
  if (!valid.ok) return { values: input, errors: valid.errors };
  if (!UUID.test(id)) return { values: input, formError: GONE };

  const updated = await updateItem(
    getDb(),
    { ownerId: owner.id, id, kind: "highlight" },
    valid.value,
  );
  if (!updated) return { values: input, formError: GONE };
  revalidateHighlights();
  return { saved: true };
}

export async function deleteHighlightAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = text(form, "id");
  if (UUID.test(id)) await deleteItem(getDb(), { ownerId: owner.id, id, kind: "highlight" });
  revalidateHighlights();
}
