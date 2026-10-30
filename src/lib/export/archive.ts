import { asc, eq } from "drizzle-orm";
import { Zip, ZipDeflate } from "fflate";

import type { Db } from "@/db/client";
import { item as itemTable } from "@/db/schema";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { loadItems, type Item } from "@/lib/items/queries";
import { itemHeadline } from "@/lib/public-url";
import type { Site } from "@/lib/site";

import { EXPORT_SCHEMA, EXPORT_VERSION, exportItem, exportJson, exportSite } from "./format";
import { frontMatter, itemBody, itemFilePath, type QuoteLookup } from "./markdown";

// The export as a zip that is written as it is read: items are loaded a page
// at a time, compressed and sent, so a long history needs no memory to match.

const PAGE = 100;

const encoder = new TextEncoder();

export type ZipEntry = { path: string; chunks: AsyncIterable<string> | Iterable<string> };

// The bytes of a zip of these entries. One entry is written at a time, and
// the next is not started until what is waiting has been read.
export async function* zipBytes(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const ready: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else ready.push(chunk);
  });
  const drain = function* () {
    if (failure) throw failure;
    yield* ready.splice(0);
  };
  for await (const entry of entries) {
    const file = new ZipDeflate(entry.path, { level: 6 });
    zip.add(file);
    for await (const chunk of entry.chunks) {
      file.push(encoder.encode(chunk));
      yield* drain();
    }
    file.push(new Uint8Array(0), true);
    yield* drain();
  }
  zip.end();
  yield* drain();
}

async function* itemPages(db: Db, ids: readonly string[]): AsyncGenerator<Item> {
  for (let at = 0; at < ids.length; at += PAGE) yield* await loadItems(db, ids.slice(at, at + PAGE));
}

async function* exportedItems(db: Db, ids: readonly string[]) {
  for await (const item of itemPages(db, ids)) yield exportItem(item);
}

// Everything the owner has made, oldest first: selah-export.json, then one
// Markdown file per item. The ids are read once, so both tell the same story.
export async function* exportEntries(
  db: Db,
  ownerId: string,
  site: Pick<Site, "title" | "handle" | "defaultTranslationId">,
  now: Date = new Date(),
): AsyncGenerator<ZipEntry> {
  const rows = await db
    .select({ id: itemTable.id })
    .from(itemTable)
    .where(eq(itemTable.ownerId, ownerId))
    .orderBy(asc(itemTable.createdAt), asc(itemTable.id));
  const ids = rows.map((row) => row.id);
  const translations = await listTranslations(db, site.defaultTranslationId);

  yield {
    path: "selah-export.json",
    chunks: exportJson(
      {
        schema: EXPORT_SCHEMA,
        version: EXPORT_VERSION,
        exportedAt: now.toISOString(),
        site: exportSite(site),
      },
      exportedItems(db, ids),
    ),
  };

  const lookup: QuoteLookup = async (ranges, translation) => {
    if (!translation) return undefined;
    const runs = (await getPassages(db, [translation.id], ranges)).get(translation.id) ?? [];
    return runs.some((run) => run.length > 0) ? { translation, runs } : undefined;
  };
  for await (const item of itemPages(db, ids)) {
    const body = await itemBody(item, translations, lookup);
    yield {
      path: itemFilePath(item),
      chunks: [`${frontMatter(exportItem(item), itemHeadline(item))}\n${body}`],
    };
  }
}
