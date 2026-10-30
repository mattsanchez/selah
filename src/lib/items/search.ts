import { and, desc, eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { item, itemEmbedding } from "@/db/schema";
import type { AiProvider } from "@/lib/ai/types";
import { normalizeQuery } from "@/lib/bible/search";
import type { VerseRange } from "@/lib/bible/verse-id";
import { fuseRankings } from "@/lib/embeddings/fusion";
import { embedQuery } from "@/lib/embeddings/query";

import {
  itemCondition,
  listItems,
  loadItems,
  type Item,
  type ItemFilter,
  type ItemKind,
  type ItemVisibility,
} from "./queries";

// Finding the owner's own items: by their words, tag, passage (an item on
// verses that overlap the ones asked for counts), kind, color and visibility,
// and by meaning where the item has a vector. Everything here is the owner's
// alone, like ./queries.ts: nothing a visitor reaches may call it.

export type ItemSearch = {
  // Words, in the syntax of websearch_to_tsquery; text as typed also matches
  // inside a word, so results come while it is being typed.
  text?: string;
  // A tag's slug.
  tag?: string;
  // Verses: an item matches when one of its passages overlaps one of them.
  ranges?: readonly VerseRange[];
  kinds?: readonly ItemKind[];
  color?: string;
  visibility?: ItemVisibility;
  // Also items that mean what `text` says, if they have vectors.
  meaning?: boolean;
  // Leaves this item out: the one being edited.
  except?: string;
};

export type ItemSearchResults = {
  items: Item[];
  total: number;
  // How they are ordered: newest first, best words first, or both lists fused.
  order: "newest" | "words" | "words-and-meaning";
};

export type ItemPage = {
  limit: number;
  offset?: number;
  provider?: Pick<AiProvider, "name" | "embed" | "embeddingModel" | "minSimilarity">;
};

// How far down each list fusion looks.
const CANDIDATES = 200;

// Whether the owner has any item with a vector of this model.
export async function itemsHaveVectors(db: Db, ownerId: string, model: string | null): Promise<boolean> {
  if (!model) return false;
  const rows = await db
    .select({ one: sql`1` })
    .from(itemEmbedding)
    .innerJoin(item, eq(item.id, itemEmbedding.itemId))
    .where(and(eq(itemEmbedding.model, model), eq(item.ownerId, ownerId)))
    .limit(1);
  return rows.length > 0;
}

export async function searchItems(
  db: Db,
  ownerId: string,
  search: ItemSearch,
  { limit, offset = 0, provider }: ItemPage,
): Promise<ItemSearchResults> {
  const { text, tag, ranges, kinds, color, visibility, meaning, except } = search;
  const words = normalizeQuery(text ?? "");
  const filter: ItemFilter = { ownerId, tag, ranges, kinds, color, visibility, except };

  if (!words) return { ...(await listItems(db, filter, { limit, offset })), order: "newest" };

  const where = itemCondition({ ...filter, text: words });
  const rank = sql`ts_rank_cd(${item.search}, websearch_to_tsquery('english', ${words}))`;
  const byWords = db
    .select({ id: item.id })
    .from(item)
    .where(where)
    .orderBy(desc(rank), desc(item.createdAt), desc(item.id));

  const model = provider?.embeddingModel;
  const vector = meaning && provider && model ? await embedQuery(provider, words) : undefined;
  if (!provider || !model || !vector) {
    const [total, ids] = await Promise.all([
      db.$count(item, where),
      byWords.limit(limit).offset(offset),
    ]);
    return { items: await loadItems(db, ids.map((row) => row.id)), total, order: "words" };
  }

  const distance = sql<number>`${itemEmbedding.embedding} <=> ${JSON.stringify(vector)}::vector`;
  const [wordRows, vectorRows] = await Promise.all([
    byWords.limit(CANDIDATES),
    db
      .select({ id: item.id, distance })
      .from(item)
      .innerJoin(itemEmbedding, and(eq(itemEmbedding.itemId, item.id), eq(itemEmbedding.model, model)))
      .where(itemCondition(filter))
      .orderBy(distance)
      .limit(CANDIDATES),
  ]);
  const near = vectorRows.filter((row) => 1 - Number(row.distance) >= provider.minSimilarity);
  const fused = fuseRankings([wordRows.map((row) => row.id), near.map((row) => row.id)]);
  return {
    items: await loadItems(db, fused.slice(offset, offset + limit)),
    total: fused.length,
    order: "words-and-meaning",
  };
}
