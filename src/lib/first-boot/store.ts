import { asc, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { bootStep } from "@/db/schema";

import type { BootStepStore } from "./runner";
import { summarizeFirstBoot, type FirstBootStatus } from "./status";

export function bootStepStore(db: Db): BootStepStore {
  return {
    list: () => db.select().from(bootStep).orderBy(asc(bootStep.position)),

    register: (steps, keepDone) =>
      db.transaction(async (tx) => {
        const ids = steps.map((step) => step.id);
        await (ids.length > 0
          ? tx.delete(bootStep).where(notInArray(bootStep.id, ids))
          : tx.delete(bootStep));
        for (const [position, step] of steps.entries()) {
          const base = { position, title: step.title };
          const pending = {
            ...base,
            version: step.version,
            status: "pending" as const,
            message: null,
            startedAt: null,
            finishedAt: null,
            heartbeatAt: sql`now()`,
          };
          await tx
            .insert(bootStep)
            .values({ id: step.id, ...pending })
            .onConflictDoUpdate({
              target: bootStep.id,
              set: keepDone.includes(step.id) ? base : pending,
            });
        }
      }),

    start: async (id) => {
      await db
        .update(bootStep)
        .set({ status: "running", startedAt: sql`now()`, heartbeatAt: sql`now()` })
        .where(eq(bootStep.id, id));
    },
    finish: async (id) => {
      await db
        .update(bootStep)
        .set({ status: "done", message: null, finishedAt: sql`now()` })
        .where(eq(bootStep.id, id));
    },
    fail: async (id, message) => {
      await db
        .update(bootStep)
        .set({ status: "failed", message, finishedAt: sql`now()` })
        .where(eq(bootStep.id, id));
    },
    heartbeat: async () => {
      await db
        .update(bootStep)
        .set({ heartbeatAt: sql`now()` })
        .where(inArray(bootStep.status, ["pending", "running"]));
    },
  };
}

export async function getFirstBootStatus(db: Db): Promise<FirstBootStatus> {
  return summarizeFirstBoot(await bootStepStore(db).list());
}
