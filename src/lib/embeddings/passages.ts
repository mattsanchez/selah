import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { passageEmbedding, translation, verse } from "@/db/schema";
import type { AiProvider } from "@/lib/ai/types";
import type { VerseRange } from "@/lib/bible/verse-id";

import { buildWindows, textHash } from "./windows";

// The vectors of the verse windows: making them, and finding the nearest.

// The translations an install embeds: the two the spec names, and the site's
// default when it is another one, so that an owner reading the KJV has meaning
// search too. Texts fetched from an API are never embedded.
const EMBEDDED_TRANSLATIONS = ["bsb", "web"];

export async function embeddingTargets(db: Db, defaultId?: string): Promise<string[]> {
  const wanted = [...new Set([...EMBEDDED_TRANSLATIONS, ...(defaultId ? [defaultId] : [])])];
  const rows = await db
    .select({ id: translation.id })
    .from(translation)
    .where(and(inArray(translation.id, wanted), eq(translation.provider, "local")));
  return wanted.filter((id) => rows.some((row) => row.id === id));
}

const vectorParam = (vector: readonly number[]) => sql`${JSON.stringify(vector)}::vector`;

async function verseTexts(db: Db, translationId: string) {
  return db
    .select({ verseId: verse.verseId, text: verse.text })
    .from(verse)
    .where(eq(verse.translationId, translationId))
    .orderBy(asc(verse.verseId));
}

// How many windows these translations have.
export async function countWindows(db: Db, translationIds: readonly string[]): Promise<number> {
  let count = 0;
  for (const id of translationIds) count += buildWindows(await verseTexts(db, id)).length;
  return count;
}

export async function countEmbedded(
  db: Db,
  model: string,
  translationIds: readonly string[],
): Promise<number> {
  if (translationIds.length === 0) return 0;
  return db.$count(
    passageEmbedding,
    and(eq(passageEmbedding.model, model), inArray(passageEmbedding.translationId, [...translationIds])),
  );
}

export type EmbedProgress = { done: number; total: number };

// Embeds every window of these translations that has no vector of this model,
// or whose text has changed, and removes vectors of windows that no longer
// exist. Each batch is saved as it comes back, so running this again carries
// on where it stopped. Rejects when the provider fails; what was saved stays.
export async function embedPassages(
  db: Db,
  provider: AiProvider,
  translationIds: readonly string[],
  { batchSize = 64, onProgress }: { batchSize?: number; onProgress?: (progress: EmbedProgress) => Promise<void> | void } = {},
): Promise<EmbedProgress> {
  const model = provider.embeddingModel;
  if (!model) throw new Error("This provider makes no embeddings.");

  const plan = [];
  let done = 0;
  for (const translationId of translationIds) {
    const windows = buildWindows(await verseTexts(db, translationId));
    const stored = await db
      .select({
        start: passageEmbedding.verseStart,
        end: passageEmbedding.verseEnd,
        hash: passageEmbedding.textHash,
      })
      .from(passageEmbedding)
      .where(and(eq(passageEmbedding.model, model), eq(passageEmbedding.translationId, translationId)));
    const hashes = new Map(stored.map((row) => [`${row.start}-${row.end}`, row.hash]));
    const pending = windows
      .map((window) => ({ ...window, hash: textHash(window.text) }))
      .filter((window) => hashes.get(`${window.start}-${window.end}`) !== window.hash);

    const wanted = new Set(windows.map((window) => `${window.start}-${window.end}`));
    const gone = stored.filter((row) => !wanted.has(`${row.start}-${row.end}`));
    for (const row of gone) {
      await db
        .delete(passageEmbedding)
        .where(
          and(
            eq(passageEmbedding.model, model),
            eq(passageEmbedding.translationId, translationId),
            eq(passageEmbedding.verseStart, row.start),
            eq(passageEmbedding.verseEnd, row.end),
          ),
        );
    }
    done += windows.length - pending.length;
    plan.push({ translationId, pending });
  }

  const total = done + plan.reduce((sum, { pending }) => sum + pending.length, 0);
  await onProgress?.({ done, total });
  for (const { translationId, pending } of plan) {
    for (let at = 0; at < pending.length; at += batchSize) {
      const batch = pending.slice(at, at + batchSize);
      const vectors = await provider.embed(
        batch.map((window) => window.text),
        { inputType: "document" },
      );
      await db
        .insert(passageEmbedding)
        .values(
          batch.map((window, i) => ({
            model,
            translationId,
            verseStart: window.start,
            verseEnd: window.end,
            textHash: window.hash,
            embedding: vectors[i],
          })),
        )
        .onConflictDoUpdate({
          target: [
            passageEmbedding.model,
            passageEmbedding.translationId,
            passageEmbedding.verseStart,
            passageEmbedding.verseEnd,
          ],
          set: { textHash: sql`excluded.text_hash`, embedding: sql`excluded.embedding` },
        });
      done += batch.length;
      await onProgress?.({ done, total });
    }
  }
  return { done, total };
}

// Which of these translations have vectors of this model, in the order given.
export async function embeddedTranslations(
  db: Db,
  model: string | null,
  translationIds: readonly string[],
): Promise<string[]> {
  if (!model || translationIds.length === 0) return [];
  const rows = await Promise.all(
    translationIds.map((id) =>
      db
        .select({ one: sql`1` })
        .from(passageEmbedding)
        .where(and(eq(passageEmbedding.model, model), eq(passageEmbedding.translationId, id)))
        .limit(1),
    ),
  );
  return translationIds.filter((_, i) => rows[i].length > 0);
}

export type NearestRequest = {
  model: string;
  translationIds: readonly string[];
  // Only windows inside one of these: a book, a testament.
  ranges?: readonly VerseRange[];
  // Never windows that touch this.
  except?: VerseRange;
  minSimilarity: number;
  limit: number;
};

export type NearWindow = VerseRange & { translationId: string; similarity: number };

// The windows nearest to a vector, nearest first. With a filter the index
// finds too few on its first pass, so it is told to keep going until it has
// `limit` in order (pgvector's iterative scan).
export async function nearestWindows(
  db: Db,
  vector: readonly number[],
  { model, translationIds, ranges, except, minSimilarity, limit }: NearestRequest,
): Promise<NearWindow[]> {
  const distance = sql<number>`${passageEmbedding.embedding} <=> ${vectorParam(vector)}`;
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
    await tx.execute(sql`set local hnsw.ef_search = 200`);
    return tx
      .select({
        translationId: passageEmbedding.translationId,
        start: passageEmbedding.verseStart,
        end: passageEmbedding.verseEnd,
        distance: distance.as("distance"),
      })
      .from(passageEmbedding)
      .where(
        and(
          eq(passageEmbedding.model, model),
          inArray(passageEmbedding.translationId, [...translationIds]),
          ranges?.length
            ? or(
                ...ranges.map((range) =>
                  and(gte(passageEmbedding.verseStart, range.start), lte(passageEmbedding.verseEnd, range.end)),
                ),
              )
            : undefined,
          except
            ? sql`(${passageEmbedding.verseEnd} < ${except.start} or ${passageEmbedding.verseStart} > ${except.end})`
            : undefined,
        ),
      )
      .orderBy(distance)
      .limit(limit);
  });
  return rows
    .map(({ distance: away, ...row }) => ({ ...row, similarity: 1 - Number(away) }))
    .filter((row) => row.similarity >= minSimilarity);
}

// The average of the vectors over a passage, and the verses those windows
// reach, or undefined when none of them has one.
export async function passageVector(
  db: Db,
  model: string,
  translationId: string,
  range: VerseRange,
): Promise<{ vector: number[]; reach: VerseRange } | undefined> {
  const [row] = await db
    .select({
      vector: sql<string | null>`avg(${passageEmbedding.embedding})`,
      start: sql<number>`min(${passageEmbedding.verseStart})`,
      end: sql<number>`max(${passageEmbedding.verseEnd})`,
    })
    .from(passageEmbedding)
    .where(
      and(
        eq(passageEmbedding.model, model),
        eq(passageEmbedding.translationId, translationId),
        lte(passageEmbedding.verseStart, range.end),
        gte(passageEmbedding.verseEnd, range.start),
      ),
    );
  if (!row?.vector) return undefined;
  return { vector: JSON.parse(row.vector) as number[], reach: { start: Number(row.start), end: Number(row.end) } };
}
