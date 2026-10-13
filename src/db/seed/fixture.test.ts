import { describe, expect, it } from "vitest";

import type { Db } from "../client";
import { fixtureSteps, fixtureStepsFor, seedFixture, type SeedStep } from "./fixture";

const db = {} as Db;

describe("seedFixture", () => {
  it("runs steps in order and stops at the first failure", async () => {
    const calls: string[] = [];
    const steps: SeedStep[] = [
      { name: "a", run: async () => void calls.push("a") },
      {
        name: "b",
        run: async () => {
          throw new Error("boom");
        },
      },
      { name: "c", run: async () => void calls.push("c") },
    ];

    await expect(seedFixture(db, steps, () => {})).rejects.toThrow("boom");
    expect(calls).toEqual(["a"]);
  });

  it("succeeds with no steps", async () => {
    const logs: string[] = [];
    await seedFixture(db, [], (message) => logs.push(message));
    expect(logs).toEqual(["seed: 0 fixture step(s) applied"]);
  });
});

describe("fixtureStepsFor", () => {
  it("seeds the test owner only when asked for by name", () => {
    expect(fixtureStepsFor({})).toEqual(fixtureSteps);
    expect(fixtureStepsFor({ SELAH_SEED_TEST_OWNER: "true" })).toEqual(fixtureSteps);
    expect(fixtureStepsFor({ NODE_ENV: "test" })).toEqual(fixtureSteps);

    const withOwner = fixtureStepsFor({ SELAH_SEED_TEST_OWNER: "1" });
    expect(withOwner).toHaveLength(fixtureSteps.length + 1);
    expect(withOwner.at(-1)?.name).toContain("Test owner");
  });
});
