import { execFileSync } from "node:child_process";

import { expect, test as setup } from "@playwright/test";

import { clearTestOwnerItems } from "./db";
import { OWNER_STATE, TEST_OWNER } from "./owner";

// Runs once before the journeys on the fixture server: makes sure the test
// owner exists (the seed adds it only when asked) and has made nothing yet,
// signs in through the real sign-in page and keeps the session for the specs
// that want it.
setup("seed the test owner and sign in", async ({ page }) => {
  execFileSync("pnpm", ["exec", "tsx", "scripts/db-seed-fixture.ts"], {
    env: { ...process.env, SELAH_SEED_TEST_OWNER: "1" },
    stdio: "inherit",
  });
  await clearTestOwnerItems();

  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(TEST_OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Owner" })).toContainText(TEST_OWNER.email);

  await page.context().storageState({ path: OWNER_STATE });
});
