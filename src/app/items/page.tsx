import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createReflectionAction } from "@/app/items/actions";
import { FeedItem } from "@/components/items/feed-item";
import { NoteForm } from "@/components/items/note-form";
import { ShareControls } from "@/components/items/share-controls";
import { ReaderShell } from "@/components/reader/reader-shell";
import { getDb } from "@/db/client";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { ITEMS_PAGE_SIZE, editItemPath, itemsPath, parseItemFilters } from "@/lib/items-url";
import { loadFeedEntries } from "@/lib/items/feed";
import { listItems, listTags, type ItemKind } from "@/lib/items/queries";
import { readerPath } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/items">;

export const metadata: Metadata = { title: "My items", robots: { index: false } };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const KINDS: { kind?: ItemKind; label: string }[] = [
  { label: "Everything" },
  { kind: "highlight", label: "Highlights" },
  { kind: "reflection", label: "Reflections" },
  { kind: "note", label: "Notes" },
];

const VISIBILITY = { private: "Private", unlisted: "Unlisted", public: "Public" } as const;

const muted = "text-stone-600 dark:text-stone-400";
const link =
  "underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";
const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";
const chipOff =
  "border-stone-300 bg-white hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800";
const chipOn =
  "border-stone-900 bg-stone-900 text-stone-50 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900";

// "My items": everything the owner has made, of every kind, newest first,
// drafts and private items included, each as it shows in the feed, with its
// visibility and the way to edit it. Also where a note on no passage and a
// reflection on no passage are started. See src/lib/items-url.ts for the URLs.
export default async function ItemsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseItemFilters({
    kind: first(params.kind),
    tag: first(params.tag),
    page: first(params.page),
  });
  const owner = await requireOwner(itemsPath(filters));
  const { kind, tag, page = 1 } = filters;

  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const [translations, tags, results] = await Promise.all([
    listTranslations(db, defaultId),
    listTags(db, owner.id),
    listItems(
      db,
      { ownerId: owner.id, kind, tag },
      { limit: ITEMS_PAGE_SIZE, offset: (page - 1) * ITEMS_PAGE_SIZE },
    ),
  ]);
  const pages = Math.ceil(results.total / ITEMS_PAGE_SIZE);
  // A page past the end, as after deleting the last item on it.
  if (results.total > 0 && page > pages) redirect(itemsPath({ ...filters, page: pages }));

  const entries = await loadFeedEntries(db, results.items, { translations, defaultId });
  const filtered = kind !== undefined || tag !== undefined;
  const count = `${results.total.toLocaleString("en")} ${results.total === 1 ? "item" : "items"}`;
  const firstShown = (page - 1) * ITEMS_PAGE_SIZE + 1;

  return (
    <ReaderShell form={{}}>
      <div className="mt-10">
        <h1 className="font-serif text-4xl tracking-tight">My items</h1>
        <p className={`mt-2 text-sm ${muted}`}>
          Your highlights, reflections and notes, drafts included. Only you can see this page.
        </p>

        <section aria-labelledby="new-note" className="mt-6 font-sans">
          <h2 id="new-note" className="mb-3 text-sm font-semibold">
            Quick note
          </h2>
          <NoteForm />
          <form action={createReflectionAction} className="mt-4">
            <p className={`text-sm ${muted}`}>
              Or{" "}
              <button type="submit" className={`cursor-pointer ${link}`}>
                start a reflection
              </button>
              . To write about a passage, select its verses in the reader.
            </p>
          </form>
        </section>

        <div className="mt-8 space-y-3 font-sans">
          <nav aria-label="Filter by kind">
            <ul className="flex flex-wrap items-center gap-1.5">
              {KINDS.map((choice) => (
                <li key={choice.label}>
                  <Link
                    href={itemsPath({ kind: choice.kind, tag })}
                    aria-current={kind === choice.kind ? "true" : undefined}
                    className={`${chip} ${kind === choice.kind ? chipOn : chipOff}`}
                  >
                    {choice.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {tags.length > 0 && (
            <nav aria-label="Filter by tag">
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {tags.map((choice) => (
                  <li key={choice.slug}>
                    <Link
                      href={itemsPath({ kind, tag: tag === choice.slug ? undefined : choice.slug })}
                      aria-current={tag === choice.slug ? "true" : undefined}
                      className={`${muted} ${link} aria-[current]:font-semibold aria-[current]:text-stone-900 dark:aria-[current]:text-stone-100`}
                    >
                      #{choice.name}
                    </Link>{" "}
                    <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                      {choice.count}
                    </span>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <p role="status" data-items-status className={`mt-6 text-sm ${muted}`}>
          {results.total === 0
            ? filtered
              ? "No items match."
              : "Nothing yet."
            : pages > 1
              ? `${count}. Showing ${firstShown}–${firstShown + results.items.length - 1}.`
              : `${count}.`}{" "}
          {filtered && (
            <Link href={itemsPath()} className={link}>
              Show everything
            </Link>
          )}
        </p>

        {entries.length > 0 && (
          <ol aria-label="Items" className="mt-4 space-y-5">
            {entries.map((entry) => {
              const { item } = entry;
              return (
                <li key={item.id}>
                  <FeedItem
                    entry={entry}
                    tagHref={(slug) => itemsPath({ tag: slug })}
                    status={
                      <>
                        <span aria-hidden="true">·</span>
                        <span data-visibility={item.visibility}>
                          {item.kind !== "highlight" && item.visibility === "private"
                            ? "Draft · Private"
                            : VISIBILITY[item.visibility]}
                        </span>
                      </>
                    }
                  >
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-sm">
                      <Link
                        href={
                          item.kind === "highlight"
                            ? readerPath(item.passages, undefined, { v: item.passages })
                            : editItemPath(item.id)
                        }
                        className={`text-stone-600 dark:text-stone-300 ${link}`}
                      >
                        Edit
                      </Link>
                      {item.kind === "highlight" && (
                        <ShareControls id={item.id} visibility={item.visibility} />
                      )}
                    </div>
                  </FeedItem>
                </li>
              );
            })}
          </ol>
        )}

        {pages > 1 && (
          <nav
            aria-label="Pages of items"
            className="mt-8 flex items-center justify-between font-sans text-sm"
          >
            {page > 1 ? (
              <Link href={itemsPath({ ...filters, page: page - 1 })} rel="prev" className={link}>
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className={muted}>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={itemsPath({ ...filters, page: page + 1 })} rel="next" className={link}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </ReaderShell>
  );
}
