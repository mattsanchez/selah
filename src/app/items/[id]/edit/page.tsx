import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteItemAction, setVisibilityAction } from "@/app/items/actions";
import { serverTimeZone } from "@/components/highlights/highlight-card";
import { FeedItem } from "@/components/items/feed-item";
import { ItemEditor } from "@/components/items/item-editor";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { editItemPath, itemsPath } from "@/lib/items-url";
import { loadFeedEntries } from "@/lib/items/feed";
import { getItem } from "@/lib/items/queries";
import { formatTags } from "@/lib/items/tags";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/items/[id]/edit">;

export const metadata: Metadata = { title: "Edit", robots: { index: false } };

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const muted = "text-stone-600 dark:text-stone-400";
const link =
  "underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";
const select =
  "h-10 rounded-md border border-stone-300 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900";

// The editor of a reflection or a note: the text, saved as it is typed; who
// may see it, and publishing; a preview of the item as the feed will show it
// (as last saved); and deleting it. A highlight has no page here: it is
// edited where it is, in the reader.
export default async function EditItemPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const owner = await requireOwner(editItemPath(id));

  const db = getDb();
  const item = await getItem(db, { ownerId: owner.id, id });
  if (!item || item.kind === "highlight") notFound();

  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const [entry] = await loadFeedEntries(db, [item], { translations, defaultId });
  const published = item.visibility !== "private";
  const what = item.kind === "reflection" ? "reflection" : "note";

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <p className="font-sans text-sm">
        <Link href={itemsPath()} className={`${muted} ${link}`}>
          My items
        </Link>
      </p>
      <h1 className="mt-4 font-serif text-4xl tracking-tight">
        {item.kind === "reflection" ? "Reflection" : "Note"}
      </h1>

      <div className="mt-6">
        <ItemEditor
          id={item.id}
          kind={item.kind}
          saved={{
            title: item.title ?? "",
            markdown: item.markdown ?? "",
            tags: formatTags(item.tags),
          }}
          savedAt={item.updatedAt.toISOString()}
        />
      </div>

      <section aria-labelledby="publishing" className="mt-8 font-sans">
        <h2 id="publishing" className="text-sm font-semibold">
          Publishing
        </h2>
        <p data-publish-state={item.visibility} className={`mt-1 text-sm ${muted}`}>
          {published && item.publishedAt
            ? `${item.visibility === "public" ? "Public" : "Unlisted"}. Published ${item.publishedAt.toLocaleDateString(
                "en",
                { dateStyle: "medium", timeZone: serverTimeZone() },
              )}.`
            : "A draft: private until you publish it."}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <form action={setVisibilityAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Visibility
              <select
                // Remounted when what is saved changes; see SelectField.
                key={item.visibility}
                name="visibility"
                defaultValue={published ? item.visibility : "public"}
                className={select}
              >
                <option value="public">Public: in the feed</option>
                <option value="unlisted">Unlisted: only by its link</option>
              </select>
            </label>
            <SubmitButton>{published ? "Update visibility" : "Publish"}</SubmitButton>
          </form>
          {published && (
            <form action={setVisibilityAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="visibility" value="private" />
              <button
                type="submit"
                className={`h-10 cursor-pointer rounded-md border border-stone-300 px-4 text-sm font-medium hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:hover:bg-stone-800`}
              >
                Unpublish
              </button>
            </form>
          )}
        </div>
      </section>

      <section aria-labelledby="preview" className="mt-10">
        <h2 id="preview" className="font-sans text-sm font-semibold">
          Preview <span className={`font-normal ${muted}`}>(as last saved)</span>
        </h2>
        <div className="mt-3">
          <FeedItem entry={entry} headingLevel={3} />
        </div>
      </section>

      <details className="mt-10 font-sans text-sm">
        <summary className={`cursor-pointer ${muted}`}>Delete</summary>
        <form action={deleteItemAction} className="mt-3">
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="cursor-pointer text-red-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:text-red-400"
          >
            Delete this {what}
          </button>
        </form>
      </details>
    </main>
  );
}
