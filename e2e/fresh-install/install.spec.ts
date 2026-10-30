import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

// Journey 1: install and set up. On an install with no owner, open the site,
// land on setup, create the owner account with email and password, set the
// site title, handle and default translation, and see the reader use that
// default. The rest of the file follows the same install afterwards: setup is
// closed, the owner signs out and in, changes the settings, and signs in by
// magic link. The tests share one database and run in order.

test.describe.configure({ mode: "serial" });

// Where the fresh-install server keeps its files (scripts/e2e-fresh-install.ts).
const DATA_DIR = path.join(".data", "e2e-fresh-install");

const OWNER = { email: "matt@example.org", password: "correct horse battery staple" };
const ANTHROPIC_KEY = "sk-ant-e2e-not-a-real-key-0123456789";

// What a self-hoster reads from the server's logs.
const setupToken = () => readFileSync(path.join(DATA_DIR, "setup-token"), "utf8").trim();

async function signIn(page: Page, password = OWNER.password) {
  await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const ownerBar = (page: Page) => page.getByRole("navigation", { name: "Owner" });

test("a new install leads to setup, and the reader then uses the chosen default", async ({ page }) => {
  // Open the site: every page leads to setup while there is no owner.
  await page.goto("/");
  await expect(page).toHaveURL("/setup");
  await expect(page.getByRole("heading", { level: 1, name: "Set up Selah" })).toBeVisible();
  for (const path of [
    "/read/john-3.16",
    "/read/john-3.16-21?v=john-3.16",
    "/search?q=living+water",
    "/sign-in",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/setup");
  }

  // The translations on offer are the ones that are loaded.
  const translation = page.getByLabel("Default translation");
  await expect(translation.getByRole("option")).toHaveText([
    "Berean Standard Bible (BSB)",
    "King James Version (KJV)",
    "World English Bible (WEB)",
  ]);

  await page.getByLabel("Email", { exact: true }).fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Site title").fill("Morning Pages");
  await page.getByLabel("Handle").fill("@Matt");
  await translation.selectOption("web");
  await page.getByLabel("Anthropic API key", { exact: true }).fill(ANTHROPIC_KEY);

  // Without the token from the server's logs, nothing is created.
  await page.getByLabel("Setup token").fill("not-the-token");
  await page.getByRole("button", { name: "Create account and finish" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "setup token" })).toBeVisible();
  await expect(page).toHaveURL("/setup");
  // What was typed is still there, except the secrets.
  await expect(page.getByLabel("Site title")).toHaveValue("Morning Pages");
  await expect(translation).toHaveValue("web");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");

  // A password that is too short is refused by the server too.
  await page.getByLabel("Setup token").fill(setupToken());
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Password", { exact: true }).evaluate((input) => input.removeAttribute("minlength"));
  await page.getByRole("button", { name: "Create account and finish" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least 10 characters" })).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Anthropic API key", { exact: true }).fill(ANTHROPIC_KEY);
  await page.getByRole("button", { name: "Create account and finish" }).click();

  // Setup signs the owner in and opens the reader, under the new title.
  await expect(page).toHaveURL("/read");
  await expect(ownerBar(page)).toContainText(OWNER.email);
  await expect(page.getByRole("link", { name: "Morning Pages" })).toBeVisible();

  // The reader uses the default translation that was chosen: the WEB.
  await page.getByRole("textbox", { name: "Passage" }).fill("John 3:16");
  await page.getByRole("textbox", { name: "Passage" }).press("Enter");
  await expect(page).toHaveURL("/read/john-3.16");
  await expect(page).toHaveTitle("John 3:16 · Morning Pages");
  await expect(page.locator("[data-passage='web']")).toContainText(
    "For God so loved the world, that he gave his only born",
  );
  await expect(page.locator("[data-passage='bsb']")).toHaveCount(0);
  await expect(page.locator("[data-attribution='web']")).toBeVisible();
});

test("setup cannot be run a second time", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  // The site is open to visitors now.
  await page.goto("/read/john-3.16");
  await expect(page.locator("[data-passage='web']")).toBeVisible();
  await expect(ownerBar(page)).toHaveCount(0);

  // This install has the Bible but no study sources, as when their downloads
  // failed at first boot: the study panel opens and says so, section by section.
  await page.goto("/read/john-3.16?v=john-3.16");
  const panel = page.getByRole("complementary", { name: "John 3:16" });
  await expect(panel).toContainText("No cross references for this verse.");
  await expect(panel).toContainText("No commentary on this verse.");
  await expect(panel).toContainText("No study notes on this verse.");
  // The search box works here too.
  await page.goto("/search?q=loved+the+world");
  await expect(page.locator("[data-result='43003016']").first()).toContainText(
    "For God so loved the world",
  );

  // This install has AI off and no embeddings. Search is the keyword search,
  // whatever is asked for, and nothing is said of what is missing.
  for (const address of ["/search?q=loved+the+world", "/search?q=loved+the+world&mode=meaning"]) {
    await page.goto(address);
    await expect(page.locator("[data-search-status]")).toHaveText(/^\d+ verses? in the WEB\.$/);
    await expect(page.locator("[data-result]").first().locator("mark").first()).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(/\bAI\b|Voyage|embedding|meaning|error/i);
  }
  await page.goto("/search");
  await expect(page.locator("main")).not.toContainText(/\bAI\b|Voyage|embedding|by meaning/i);
  await page.goto("/search?q=the+and+of&mode=both");
  await expect(page.locator("[data-search-status]")).toContainText("too common");
  // And the study panel has no "Related" section to show.
  await page.goto("/read/john-3.16?v=john-3.16");
  await expect(page.locator("[data-study-section='related']")).toHaveCount(0);
});

test("the owner signs out and in, and settings need the owner", async ({ page }) => {
  // A visitor is sent to sign in, and back to where they were going.
  await page.goto("/settings");
  await expect(page).toHaveURL("/sign-in?next=%2Fsettings");

  await signIn(page, "not the password");
  await expect(page.getByRole("alert").filter({ hasText: "password" })).toHaveText(
    "That email and password do not match.",
  );
  await expect(ownerBar(page)).toHaveCount(0);

  await signIn(page);
  await expect(page).toHaveURL("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  // The session lasts across pages.
  await page.goto("/read/psalm-23");
  await expect(ownerBar(page)).toContainText(OWNER.email);

  await ownerBar(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await expect(ownerBar(page)).toHaveCount(0);
  await page.goto("/settings");
  await expect(page).toHaveURL("/sign-in?next=%2Fsettings");
});

test("the owner changes the settings later, and saved keys are never shown", async ({ page }) => {
  await page.goto("/settings");
  await signIn(page);

  // What setup saved is here; the handle was tidied.
  await expect(page.getByLabel("Site title")).toHaveValue("Morning Pages");
  await expect(page.getByLabel("Handle")).toHaveValue("matt");
  await expect(page.getByLabel("Default translation")).toHaveValue("web");

  // The key given at setup is saved, and not on the page in any form.
  const anthropic = page.locator("[data-ai-key='anthropic']");
  await expect(anthropic).toHaveAttribute("data-source", "saved");
  await expect(page.getByLabel("Anthropic API key", { exact: true })).toHaveValue("");
  await expect(page.locator("[data-ai-key='voyage']")).toHaveAttribute("data-source", "none");
  expect(await page.content()).not.toContain(ANTHROPIC_KEY);
  await expect(page.locator("[data-embedding-state='off']")).toContainText("Add a Voyage AI key");

  await page.getByLabel("Handle").fill("no spaces allowed");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "lowercase letters" })).toBeVisible();

  await page.getByLabel("Site title").fill("Evening Pages");
  await page.getByLabel("Handle").fill("matt-s");
  await page.getByLabel("Default translation").selectOption("kjv");
  await page.getByLabel("Voyage AI API key", { exact: true }).fill("pa-e2e-not-a-real-key");
  await page.getByLabel("Remove the saved Anthropic API key").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");

  await page.reload();
  await expect(page.getByLabel("Site title")).toHaveValue("Evening Pages");
  await expect(page.getByLabel("Handle")).toHaveValue("matt-s");
  await expect(anthropic).toHaveAttribute("data-source", "none");
  await expect(page.locator("[data-ai-key='voyage']")).toHaveAttribute("data-source", "saved");
  expect(await page.content()).not.toContain("pa-e2e-not-a-real-key");

  // The reader follows the new default and the new title.
  await page.goto("/read/john-3.16");
  await expect(page).toHaveTitle("John 3:16 · Evening Pages");
  await expect(page.locator("[data-passage='kjv']")).toContainText(
    "For God so loved the world, that he gave his only begotten",
  );
});

test("with email configured, the owner signs in by a link that works once", async ({ page }) => {
  const outbox = path.join(DATA_DIR, "outbox");
  const sent = () => {
    try {
      return readdirSync(outbox).sort();
    } catch {
      return [];
    }
  };
  const before = sent().length;

  await page.goto("/sign-in?next=%2Fsettings");
  const linkForm = page.getByRole("form", { name: "Or get a sign-in link" });

  // Someone else's address gets the same answer and no email.
  await linkForm.getByLabel("Email for the link").fill("stranger@example.org");
  await linkForm.getByRole("button", { name: "Email me a link" }).click();
  await expect(page).toHaveURL("/sign-in/check-email");
  expect(sent()).toHaveLength(before);

  await page.goto("/sign-in?next=%2Fsettings");
  await linkForm.getByLabel("Email for the link").fill(OWNER.email);
  await linkForm.getByRole("button", { name: "Email me a link" }).click();
  await expect(page).toHaveURL("/sign-in/check-email");
  await expect.poll(() => sent().length).toBe(before + 1);

  // The stub transport wrote the message to a file instead of sending it.
  const message = JSON.parse(readFileSync(path.join(outbox, sent().at(-1)!), "utf8"));
  expect(message.to).toBe(OWNER.email);
  expect(message.subject).toBe("Sign in to Evening Pages");
  const link = /https?:\/\/\S+/.exec(message.text)![0];
  // The link points at the configured public address.
  expect(new URL(link).origin).toBe(new URL(page.url()).origin);

  await page.goto(link);
  await expect(page).toHaveURL("/settings");
  await expect(ownerBar(page)).toContainText(OWNER.email);

  // Used once: the same link no longer signs anyone in.
  await ownerBar(page).getByRole("button", { name: "Sign out" }).click();
  await expect(ownerBar(page)).toHaveCount(0);
  await page.goto(link);
  await expect(page.getByRole("alert").filter({ hasText: "link" })).toContainText(
    "expired or was already used",
  );
  await expect(ownerBar(page)).toHaveCount(0);
});
