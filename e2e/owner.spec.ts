import { expect, test } from "@playwright/test";

import { OWNER_STATE, TEST_OWNER, TEST_SITE } from "./owner";

// The owner account on the seeded fixture: what a visitor sees, and what the
// signed-in test owner sees. Journey 1 itself is in fresh-install/.

test.describe("a visitor", () => {
  test("reads without an account and sees nothing of the owner's", async ({ page }) => {
    await page.goto("/read/john-3.16");
    await expect(page.locator("[data-passage='bsb']")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Owner" })).toHaveCount(0);
  });

  test("is sent to sign in by the settings page, and setup is closed", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL("/sign-in?next=%2Fsettings");
    await page.goto("/setup");
    await expect(page).toHaveURL("/sign-in");
  });

  test("is not offered a sign-in link when email is not configured", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a link" })).toHaveCount(0);
  });

  test("cannot be sent off the site after signing in", async ({ page }) => {
    await page.goto("/sign-in?next=https%3A%2F%2Fevil.example%2F");
    await page.getByLabel("Email", { exact: true }).fill(TEST_OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_OWNER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("the signed-in owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("has the owner bar on every page", async ({ page }) => {
    for (const path of ["/", "/read/john-3.16"]) {
      await page.goto(path);
      const bar = page.getByRole("navigation", { name: "Owner" });
      await expect(bar).toContainText(`Signed in as ${TEST_OWNER.email}`);
      await expect(bar.getByRole("link", { name: "Settings" })).toBeVisible();
    }
  });

  test("opens settings and saves an API key that is never shown again", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByLabel("Site title")).toHaveValue(TEST_SITE.title);
    await expect(page.getByLabel("Default translation")).toHaveValue(
      TEST_SITE.defaultTranslationId,
    );

    // Only the key changes: other journeys rely on the title and the default.
    const key = "pa-fixture-not-a-real-key";
    await page.getByLabel("Voyage AI API key", { exact: true }).fill(key);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Settings saved.");

    await page.reload();
    const voyage = page.locator("[data-ai-key='voyage']");
    await expect(voyage).toHaveAttribute("data-source", "saved");
    await expect(page.getByLabel("Voyage AI API key", { exact: true })).toHaveValue("");
    expect(await page.content()).not.toContain(key);

    await page.getByLabel("Remove the saved Voyage AI API key").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toHaveText("Settings saved.");
    await page.reload();
    await expect(voyage).toHaveAttribute("data-source", "none");
  });
});
