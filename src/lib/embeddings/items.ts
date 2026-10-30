import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb, type Db } from "@/db/client";
import { item, itemEmbedding } from "@/db/schema";
import { loadAiProvider } from "@/lib/ai/load";
import type { AiProvider } from "@/lib/ai/types";
import { parseDocument } from "@/lib/items/cards";
import { markdownExcerpt } from "@/lib/items/markdown";

import { textHash } from "./windows";

// The vectors of the owner's reflections and notes. A highlight has none: its
// words are the Bible's, and its note is found by full-text search.
//
// Embedding is never part of a save. A save asks for it with
// scheduleItemEmbedding() and returns; the call happens a little later, once
// the writer has paused, and a failure here is forgotten: the item is still
// found by its words, and the next save or `embedPendingItems` tries again.

// A long reflection: enough to know what it is about, at a bounded cost.
const MAX_TEXT_CHARS = 8_000;
// Autosave saves about a second after each pause in typing.
const DEBOUNCE_MS = 4_000;

type Embeddable = { kind: string; title: string | null; markdown: string | null; note: string | null };

// What an item says, as one line of plain text: its title and words, without
// its passage cards (the Bible's words are not the writer's).
export function itemEmbeddingText({ kind, title, markdown, note }: Embeddable): string {
  if (kind === "highlight") return "";
  const body = (markdown ? parseDocument(markdown) : [])
    .flatMap((segment) => (segment.type === "markdown" ? [segment.text] : []))
    .join("\n\n");
  return [title, note, body && markdownExcerpt(body, MAX_TEXT_CHARS)]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n");
}

async function storeVectors(db: Db, provider: AiProvider, model: string, rows: { id: string; text: string; hash: string }[]) {
  const vectors = await provider.embed(
    rows.map((row) => row.text),
    { inputType: "document" },
  );
  await db
    .insert(itemEmbedding)
    .values(rows.map((row, i) => ({ itemId: row.id, model, textHash: row.hash, embedding: vectors[i] })))
    .onConflictDoUpdate({
      target: [itemEmbedding.itemId, itemEmbedding.model],
      set: { textHash: sql`excluded.text_hash`, embedding: sql`excluded.embedding` },
    });
}

// Brings the vector of each non-highlight item that needs one up to date, or
// drops it when the item no longer has any text. Rejects when the provider fails.
export async function embedPendingItems(
  db: Db,
  provider: AiProvider,
  { ids }: { ids?: readonly string[] } = {},
): Promise<number> {
  const model = provider.embeddingModel;
  if (!model) return 0;
  const rows = await db
    .select({
      id: item.id,
      kind: item.kind,
      title: item.title,
      markdown: item.markdown,
      note: item.note,
      hash: itemEmbedding.textHash,
    })
    .from(item)
    .leftJoin(itemEmbedding, and(eq(itemEmbedding.itemId, item.id), eq(itemEmbedding.model, model)))
    .where(and(ne(item.kind, "highlight"), ids ? inArray(item.id, [...ids]) : undefined));

  const pending = [];
  for (const row of rows) {
    const text = itemEmbeddingText(row);
    if (text && textHash(text) !== row.hash) pending.push({ id: row.id, text, hash: textHash(text) });
    if (!text && row.hash) {
      await db
        .delete(itemEmbedding)
        .where(and(eq(itemEmbedding.itemId, row.id), eq(itemEmbedding.model, model)));
    }
  }
  for (let at = 0; at < pending.length; at += 32) {
    await storeVectors(db, provider, model, pending.slice(at, at + 32));
  }
  return pending.length;
}

const timers = ((globalThis as typeof globalThis & { selahEmbedTimers?: Map<string, NodeJS.Timeout> }).selahEmbedTimers ??=
  new Map<string, NodeJS.Timeout>());

// Embeds this item shortly, once saves of it have stopped coming. Returns at
// once, and cannot fail: there may be no key, no network, or no such item by then.
export function scheduleItemEmbedding(id: string, delayMs = DEBOUNCE_MS): void {
  clearTimeout(timers.get(id));
  const timer = setTimeout(() => {
    timers.delete(id);
    void (async () => {
      const provider = await loadAiProvider();
      if (provider.embeddingModel) await embedPendingItems(getDb(), provider, { ids: [id] });
    })().catch(() => {});
  }, delayMs);
  timer.unref?.();
  timers.set(id, timer);
}
