import type { MetadataRoute } from "next";

import { getDb } from "@/db/client";
import { listPublicItems, publicTags } from "@/lib/items/public";
import { normalizeRanges } from "@/lib/bible/ranges";
import { passagePath, permalinkPath, tagPath } from "@/lib/public-url";
import { siteOrigin } from "@/lib/site-origin";

// The most items a sitemap file may list is 50,000; one writer's site is far
// from it.
const MAX_ITEMS = 10_000;

export const dynamic = "force-dynamic";

// The public pages: the front page, every public item, every tag and every
// passage a public item is on. Unlisted and private items are not in it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const [origin, { items }, tags] = await Promise.all([
    siteOrigin(),
    listPublicItems(db, {}, { limit: MAX_ITEMS }),
    publicTags(db),
  ]);
  const passages = new Map<string, Date>();
  for (const item of items) {
    for (const range of normalizeRanges(item.passages)) {
      const path = passagePath([range]);
      const date = item.publishedAt ?? item.updatedAt;
      if (!passages.has(path) || passages.get(path)! < date) passages.set(path, date);
    }
  }
  return [
    { url: `${origin}/`, lastModified: items[0]?.updatedAt },
    ...items.map((item) => ({ url: `${origin}${permalinkPath(item)}`, lastModified: item.updatedAt })),
    ...tags.map((tag) => ({ url: `${origin}${tagPath(tag.slug)}`, lastModified: tag.latest })),
    ...[...passages].map(([path, date]) => ({ url: `${origin}${path}`, lastModified: date })),
  ];
}
