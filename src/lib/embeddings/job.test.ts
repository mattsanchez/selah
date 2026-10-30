import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@/db/client";
import type { AiProvider } from "@/lib/ai/types";
import { EmbeddingError } from "@/lib/ai/voyage";

import { JOB_STALLED_AFTER_MS, claimJob, getEmbeddingStatus, jobFailureMessage, runEmbeddingJob } from "./job";

type Sent = { sql: string; params: unknown[] };

function recordingDb(answer: (sql: string) => unknown[] = () => []) {
  const sent: Sent[] = [];
  const db = drizzle(async (sql, params) => {
    sent.push({ sql, params });
    return { rows: answer(sql) };
  });
  return { db: db as unknown as Db, sent };
}

const provider = (embed = vi.fn(async (texts: string[]) => texts.map(() => [1]))): AiProvider => ({
  name: "stub",
  enabled: true,
  embeddingModel: "test-model",
  minSimilarity: 0,
  complete: async () => ({ text: "" }),
  embed,
});

const off = { ...provider(), embeddingModel: null };

// Columns of `embedding_job`, in schema order.
const jobRow = (status: string, model: string, heartbeat: Date | null, done = 5, total = 10, message: string | null = null) => [
  1, status, model, done, total, message, null, null, heartbeat?.toISOString() ?? null,
];

describe("claimJob", () => {
  it("takes the row unless a live run has it", async () => {
    const { db, sent } = recordingDb(() => [[1]]);
    expect(await claimJob(db, "test-model")).toBe(true);
    expect(sent[0].sql).toContain(`on conflict ("id") do update`);
    expect(sent[0].sql).toContain(`"embedding_job"."status" <> 'running' or "embedding_job"."heartbeat_at" <`);
  });

  it("is refused while one is running", async () => {
    const { db } = recordingDb();
    expect(await claimJob(db, "test-model")).toBe(false);
  });
});

describe("runEmbeddingJob", () => {
  it("does nothing while another run is alive", async () => {
    const { db, sent } = recordingDb();
    const embed = vi.fn(async () => []);
    expect(await runEmbeddingJob(db, provider(embed))).toBe("busy");
    expect(sent).toHaveLength(1);
    expect(embed).not.toHaveBeenCalled();
  });

  it("records a provider's failure for the page, and does not throw it", async () => {
    const { db, sent } = recordingDb((sql) => {
      if (sql.startsWith("insert into \"embedding_job\"")) return [[1]];
      if (sql.includes(`from "verse"`)) return [[43003016, "For God so loved the world"]];
      return [];
    });
    const failing = provider(vi.fn(async () => Promise.reject(new EmbeddingError("key", "refused"))));
    expect(await runEmbeddingJob(db, failing, { translationIds: ["bsb"] })).toBe("failed");
    const recorded = sent.findLast((query) => query.sql.startsWith(`update "embedding_job"`));
    expect(recorded?.params).toEqual(expect.arrayContaining(["failed", expect.stringContaining("refused the API key")]));
  });

  it("refuses a provider that makes no embeddings", async () => {
    await expect(runEmbeddingJob(recordingDb().db, off)).rejects.toThrow();
  });
});

describe("jobFailureMessage", () => {
  it("names what the owner can do, and never a key", () => {
    expect(jobFailureMessage(new EmbeddingError("key", "x"))).toContain("Check it in Settings");
    expect(jobFailureMessage(new EmbeddingError("rate-limit", "x"))).toContain("rate limit");
    expect(jobFailureMessage(new EmbeddingError("unavailable", "x"))).toContain("could not be reached");
    expect(jobFailureMessage(new Error("Bearer pa-secret"))).not.toContain("pa-secret");
    expect(jobFailureMessage(new Error("x"))).toContain("continuing picks up");
  });
});

describe("getEmbeddingStatus", () => {
  const now = new Date("2026-10-30T12:00:00Z");

  it("is off without a provider, without a query", async () => {
    const { db, sent } = recordingDb();
    expect((await getEmbeddingStatus(db, off)).state).toBe("off");
    expect(sent).toEqual([]);
  });

  it("follows a run while its heartbeat is fresh", async () => {
    const { db } = recordingDb((sql) =>
      sql.includes(`from "embedding_job"`) ? [jobRow("running", "test-model", new Date(now.getTime() - 1000))] : [],
    );
    expect(await getEmbeddingStatus(db, provider(), { now })).toMatchObject({
      state: "running",
      embedded: 5,
      total: 10,
    });
  });

  it("calls a silent run stalled", async () => {
    const { db } = recordingDb((sql) =>
      sql.includes(`from "embedding_job"`)
        ? [jobRow("running", "test-model", new Date(now.getTime() - JOB_STALLED_AFTER_MS - 1))]
        : [],
    );
    expect((await getEmbeddingStatus(db, provider(), { now })).state).toBe("stalled");
  });

  it("ignores a run of another model", async () => {
    const { db } = recordingDb((sql) =>
      sql.includes(`from "embedding_job"`) ? [jobRow("running", "old-model", now)] : [],
    );
    expect((await getEmbeddingStatus(db, provider(), { now })).state).toBe("ready");
  });
});
