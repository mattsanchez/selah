import type { Db } from "../client";
import { bibleFixtureStep } from "./bible";
import { studyFixtureStep } from "./study";

export type SeedStep = {
  name: string;
  // Must be idempotent: `pnpm db:seed:fixture` is run repeatedly against the same database.
  run: (db: Db) => Promise<void>;
};

// The fixture the Playwright journeys run against. Append steps here in the
// order they must run.
export const fixtureSteps: SeedStep[] = [bibleFixtureStep, studyFixtureStep];

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
