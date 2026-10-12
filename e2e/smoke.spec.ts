import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Selah");
  await expect(page.getByRole("heading", { level: 1, name: "Selah" })).toBeVisible();
});

test("server runs against the migrated database with the stub AI provider", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.db).toMatchObject({ ok: true, pgvector: expect.any(String) });
  expect(body.ai).toEqual({ provider: "stub", enabled: true });
});
