import type { Db } from "../client";

export type SeedStep = {
  name: string;
  // Must be idempotent: `pnpm db:seed:fixture` is run repeatedly against the same database.
  run: (db: Db) => Promise<void>;
};

// The fixture the Playwright journeys run against. Empty until milestone 2
// adds the Bible fixture (John, Psalms, Romans); append steps here in the
// order they must run.
export const fixtureSteps: SeedStep[] = [];

export async function seedFixture(
  db: Db,
  steps: SeedStep[] = fixtureSteps,
  log: (message: string) => void = console.log,
): Promise<void> {
  for (const step of steps) {
    log(`seed: ${step.name}`);
    await step.run(db);
  }
  log(`seed: ${steps.length} fixture step(s) applied`);
}
