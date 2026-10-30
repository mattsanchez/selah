import { formatReference } from "@/lib/bible/reference";
import type { Item, ItemKind, ItemVisibility } from "@/lib/items/queries";
import type { TagName } from "@/lib/items/tags";
import { permalinkPath } from "@/lib/public-url";
import type { Site } from "@/lib/site";

// The export's JSON: selah-export.json, documented in the README. This is a
// promise to whoever reads the file later, so: add fields freely, but anything
// else that changes raises EXPORT_VERSION.

export const EXPORT_SCHEMA = "selah-export";
export const EXPORT_VERSION = 1;

export type ExportPassage = {
  // "Romans 8:28-30".
  reference: string;
  // Canonical BBCCCVVV verse ids, inclusive.
  verseStart: number;
  verseEnd: number;
  // The id of the translation it was read in, when that is known.
  translation: string | null;
};

export type ExportItem = {
  id: string;
  kind: ItemKind;
  title: string | null;
  // As stored: passage cards are `[[Reference | T]]` lines.
  markdown: string | null;
  note: string | null;
  color: string | null;
  visibility: ItemVisibility;
  // ISO 8601; null while the item is private.
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: TagName[];
  passages: ExportPassage[];
  // The path of its public page; null while it is private.
  permalink: string | null;
};

export type ExportSite = { title: string; handle: string; defaultTranslation: string };

export type ExportDocument = {
  schema: typeof EXPORT_SCHEMA;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  site: ExportSite;
  items: ExportItem[];
};

// What of the site may leave it, named field by field: `site.settings` holds
// the AI keys, so nothing is copied wholesale.
export function exportSite(site: Pick<Site, "title" | "handle" | "defaultTranslationId">): ExportSite {
  return { title: site.title, handle: site.handle, defaultTranslation: site.defaultTranslationId };
}

export function exportItem(item: Item): ExportItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    markdown: item.markdown,
    note: item.note,
    color: item.color,
    visibility: item.visibility,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    tags: item.tags,
    passages: item.passages.map(({ start, end, translationId }) => ({
      reference: formatReference([{ start, end }]),
      verseStart: start,
      verseEnd: end,
      translation: translationId,
    })),
    permalink: item.visibility === "private" ? null : permalinkPath(item),
  };
}

// The document as text, item by item, so a long export is never one string in memory.
export async function* exportJson(
  head: Omit<ExportDocument, "items">,
  items: AsyncIterable<ExportItem>,
): AsyncGenerator<string> {
  yield `${JSON.stringify(head, null, 2).replace(/\n}$/, "")},\n  "items": [`;
  let separator = "\n";
  for await (const item of items) {
    yield `${separator}    ${JSON.stringify(item)}`;
    separator = ",\n";
  }
  yield `${separator === "\n" ? "" : "\n  "}]\n}\n`;
}

// Reads an export back, refusing what is not one or is from a later version.
export function parseExport(json: string): ExportDocument {
  const value = JSON.parse(json) as Partial<ExportDocument> | null;
  if (value?.schema !== EXPORT_SCHEMA) throw new Error("This is not a Selah export.");
  if (value.version !== EXPORT_VERSION) throw new Error(`Unknown export version: ${value.version}.`);
  if (!value.site || !Array.isArray(value.items)) throw new Error("This export is incomplete.");
  return value as ExportDocument;
}
