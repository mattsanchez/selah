import { eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { embeddingJob } from "@/db/schema";
import type { AiProvider } from "@/lib/ai/types";
import { EmbeddingError } from "@/lib/ai/voyage";

import { embedPendingItems } from "./items";
import { countEmbedded, countWindows, embedPassages, embeddingTargets } from "./passages";

// The run that embeds the Bible, then any items still waiting. It is started
// by `pnpm embed:bible`, by the Settings page, or at boot when a key is
// already there; all three go through runEmbeddingJob(), and the row in
// `embedding_job` keeps it to one at a time and tells the page how it goes.

// A run touches its row at least this often...
const HEARTBEAT_MS = 10_000;
// ...so one silent for this long has died, and another may take over.
export const JOB_STALLED_AFTER_MS = 2 * 60_000;

export const CONTINUE_HINT = "What was finished is kept; continuing picks up from there.";

export function jobFailureMessage(error: unknown): string {
  if (error instanceof EmbeddingError) {
    if (error.failure === "key") return `Voyage AI refused the API key. Check it in Settings. ${CONTINUE_HINT}`;
    if (error.failure === "rate-limit") {
      return `Voyage AI's rate limit stopped the run. Try again later; an account with a payment method has much higher limits. ${CONTINUE_HINT}`;
    }
  }
  return `Voyage AI could not be reached. ${CONTINUE_HINT}`;
}

// Takes the row for a new run. False while another run is alive.
export async function claimJob(db: Db, model: string): Promise<boolean> {
  const values = {
    status: "running" as const,
    model,
    done: 0,
    total: 0,
    message: null,
    startedAt: sql`now()`,
    finishedAt: null,
    heartbeatAt: sql`now()`,
  };
  const claimed = await db
    .insert(embeddingJob)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: embeddingJob.id,
      set: values,
      where: sql`${embeddingJob.status} <> 'running' or ${embeddingJob.heartbeatAt} < now() - make_interval(secs => ${JOB_STALLED_AFTER_MS / 1000})`,
    })
    .returning({ id: embeddingJob.id });
  return claimed.length > 0;
}

export type JobResult = "done" | "failed" | "busy";

// Runs the embedding job to the end, or until the provider fails. Never rejects
// for a provider failure: that is recorded for the page, and resumed by the next run.
export async function runEmbeddingJob(
  db: Db,
  provider: AiProvider,
  {
    defaultId,
    translationIds,
    log = () => {},
    onClaimed,
  }: {
    defaultId?: string;
    translationIds?: readonly string[];
    log?: (message: string) => void;
    onClaimed?: () => void;
  } = {},
): Promise<JobResult> {
  const model = provider.embeddingModel;
  if (!model) throw new Error("This provider makes no embeddings.");
  if (!(await claimJob(db, model))) return "busy";
  onClaimed?.();

  const touch = (values: Partial<typeof embeddingJob.$inferInsert> = {}) =>
    db
      .update(embeddingJob)
      .set({ ...values, heartbeatAt: sql`now()` })
      .where(eq(embeddingJob.id, 1));
  const beat = setInterval(() => void touch().catch(() => {}), HEARTBEAT_MS);
  beat.unref?.();

  try {
    const targets = translationIds ?? (await embeddingTargets(db, defaultId));
    await embedPassages(db, provider, targets, {
      onProgress: async ({ done, total }) => {
        await touch({ done, total });
        log(`${done} of ${total} windows`);
      },
    });
    const items = await embedPendingItems(db, provider);
    if (items > 0) log(`${items} items`);
    await touch({ status: "done", finishedAt: new Date() });
    return "done";
  } catch (error) {
    const message = jobFailureMessage(error);
    log(message);
    await touch({ status: "failed", message, finishedAt: new Date() }).catch(() => {});
    return "failed";
  } finally {
    clearInterval(beat);
  }
}

export type EmbeddingStatus = {
  // "off": no provider makes embeddings. "ready": nothing has run for this
  // model yet, or it stopped short of everything. "stalled": a run died.
  state: "off" | "ready" | "running" | "stalled" | "failed" | "done";
  embedded: number;
  total: number;
  message: string | null;
};

// What the Settings page shows.
export async function getEmbeddingStatus(
  db: Db,
  provider: AiProvider,
  { defaultId, now = new Date() }: { defaultId?: string; now?: Date } = {},
): Promise<EmbeddingStatus> {
  const model = provider.embeddingModel;
  if (!model) return { state: "off", embedded: 0, total: 0, message: null };
  const [job] = await db.select().from(embeddingJob).where(eq(embeddingJob.id, 1));
  const mine = job?.model === model ? job : undefined;

  if (mine?.status === "running") {
    const alive =
      mine.heartbeatAt !== null && now.getTime() - mine.heartbeatAt.getTime() < JOB_STALLED_AFTER_MS;
    return {
      state: alive ? "running" : "stalled",
      embedded: mine.done,
      total: mine.total,
      message: null,
    };
  }
  const targets = await embeddingTargets(db, defaultId);
  const [embedded, total] = await Promise.all([
    countEmbedded(db, model, targets),
    countWindows(db, targets),
  ]);
  if (mine?.status === "failed") return { state: "failed", embedded, total, message: mine.message };
  return { state: total > 0 && embedded >= total ? "done" : "ready", embedded, total, message: null };
}
