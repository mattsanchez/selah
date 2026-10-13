import type { Db } from "../client";
import { bibleFixtureStep } from "./bible";
import { studyFixtureStep } from "./study";
import { testOwnerStep } from "./owner";
import { TEST_OWNER_FLAG } from "./test-owner";

export type SeedStep = {
  name: string;
  // Must be idempotent: `pnpm db:seed:fixture` is run repeatedly against the same database.
  run: (db: Db) => Promise<void>;
};

// The fixture the Playwright journeys run against. Append steps here in the
// order they must run.
export const fixtureSteps: SeedStep[] = [bibleFixtureStep, studyFixtureStep];

// The journeys also need a signed-in owner. An account with a published
// password must never reach a real install, so its step runs only when asked
// for by name: SELAH_SEED_TEST_OWNER=1, which `pnpm e2e` sets for itself.
export function fixtureStepsFor(env: Record<string, string | undefined> = process.env): SeedStep[] {
  return env[TEST_OWNER_FLAG] === "1" ? [...fixtureSteps, testOwnerStep] : fixtureSteps;
}

export async function seedFixture(
  db: Db,
  steps: SeedStep[] = fixtureStepsFor(),
  log: (message: string) => void = console.log,
): Promise<void> {
  for (const step of steps) {
    log(`seed: ${step.name}`);
    await step.run(db);
  }
  log(`seed: ${steps.length} fixture step(s) applied`);
}
