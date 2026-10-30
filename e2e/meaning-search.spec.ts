import { expect, test, type Page } from "@playwright/test";

import { editor } from "./editor";
import { OWNER_STATE } from "./owner";

// Journey 4, meaning half: find a passage by what it is about, not by its
// words. The fixture's vectors come from the stub provider, a hashed bag of
// words with no sense of meaning, so what these show is the plumbing: a
// passage that shares some of the query's words, though no verse has them
// all, is found by "Meaning" and not by "Keyword".
//
// Passages of its own: Psalm 94, Psalm 42:5-6, and Romans 13.

// "weary" is in no verse with the others, so keyword search finds nothing.
const QUERY = "anxiety overwhelms my weary soul";
const ADDRESS = `/search?q=${QUERY.replaceAll(" ", "+")}`;

const results = (page: Page) => page.locator("[data-result]");
const status = (page: Page) => page.locator("[data-search-status]");
const filters = (page: Page) => page.getByRole("form", { name: "Narrow the search" });
const mode = (page: Page, name: string) => filters(page).getByRole("radio", { name });
const scope = (page: Page) => filters(page).getByRole("combobox", { name: "Search in" });

test("a search by meaning finds a passage the words alone do not", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("link", { name: "verses about anxiety" })).toBeVisible();

  await page.getByRole("textbox", { name: "Passage or search" }).fill(QUERY);
  await page.getByRole("textbox", { name: "Passage or search" }).press("Enter");

  // Both by default: the toggle shows it, and the URL does not need to.
  await expect(page).toHaveURL(ADDRESS);
  await expect(mode(page, "Both")).toBeChecked();
  await expect(results(page).first()).toContainText("When anxiety overwhelms me");
  await expect(status(page)).toHaveText(/^\d+ passages? in the BSB\.( Showing 1–20\.)?$/);

  // Keyword alone has nothing: no verse has all these words.
  await mode(page, "Keyword").check();
  await expect(page).toHaveURL(`${ADDRESS}&mode=keyword`);
  await expect(status(page)).toHaveText("No verses match in the BSB.");
  await expect(results(page)).toHaveCount(0);

  // Meaning finds it, as a passage: the range, not one verse.
  await mode(page, "Meaning").check();
  await expect(page).toHaveURL(`${ADDRESS}&mode=meaning`);
  const hit = results(page).first();
  await expect(hit).toContainText("When anxiety overwhelms me");
  // Found by vector, so no word is marked as a match.
  await expect(hit.locator("mark")).toHaveCount(0);
  const reference = hit.getByRole("heading").getByRole("link");
  await expect(reference).toHaveText("Psalm 94:17-20, Berean Standard Bible");
  await expect(page.locator("[data-attribution='bsb']")).toBeVisible();

  // It opens in the reader on the whole range.
  await reference.click();
  await expect(page).toHaveURL("/read/psalm-94.17-20");
  await expect(page.getByRole("heading", { level: 1, name: "Psalm 94:17-20" })).toBeVisible();
  for (const id of [19094017, 19094018, 19094019, 19094020]) {
    await expect(page.locator(`[data-passage='bsb'] [data-verse-id='${id}']`).first()).toBeVisible();
  }
});

test("book, testament and translation filters work in every mode", async ({ page }) => {
  for (const each of ["meaning", "both"]) {
    await page.goto(`${ADDRESS}&mode=${each}`.replace("&mode=both", ""));
    await expect(results(page).first()).toContainText("anxiety");

    await scope(page).selectOption({ label: "New Testament" });
    await expect(page).toHaveURL(new RegExp(`in=nt`));
    await expect(results(page).first()).toBeVisible();
    for (const text of await results(page).getByRole("heading").getByRole("link").allTextContents()) {
      expect(text).toMatch(/^(John|Romans) /);
    }

    await scope(page).selectOption({ label: "Psalms" });
    await expect(page).toHaveURL(new RegExp(`in=psalms`));
    await expect(results(page).first()).toContainText("anxiety");

    await scope(page).selectOption({ label: "Romans" });
    await expect(page).toHaveURL(new RegExp(`in=romans`));
    for (const text of await results(page).getByRole("heading").getByRole("link").allTextContents()) {
      expect(text).toMatch(/^Romans /);
    }
  }

  // Another translation has its own vectors.
  await page.goto(`${ADDRESS}&t=web&mode=meaning`);
  await expect(results(page).first()).toHaveAttribute("data-translation", "web");
  await expect(page.locator("[data-attribution='web']")).toBeVisible();

  // Pages keep the mode.
  await page.goto("/search?q=soul+heart&mode=meaning");
  const pages = page.getByRole("navigation", { name: "Pages of results" });
  await pages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL("/search?q=soul+heart&mode=meaning&page=2");
  await expect(mode(page, "Meaning")).toBeChecked();
});

test("both together marks the words it found, on the passage around them", async ({ page }) => {
  await page.goto("/search?q=anxiety+overwhelms&in=psalms");
  await expect(mode(page, "Both")).toBeChecked();
  const hit = results(page).first();
  await expect(hit.getByRole("heading").getByRole("link")).toContainText("Psalm 94:17-20");
  await expect(hit.locator("mark")).toHaveText(["anxiety", "overwhelms"]);
  // The verse is not listed again on its own.
  await expect(page.locator("[data-result='19094019']")).toHaveCount(0);

  // A word in many verses: the best of them, and a way to see them all.
  await page.goto("/search?q=lord");
  await expect(status(page)).toContainText("The best of");
  await status(page).getByRole("link", { name: "See them all" }).click();
  await expect(page).toHaveURL("/search?q=lord&mode=keyword");
  await expect(status(page)).toHaveText(/ verses in the BSB\. Showing 1–20\.$/);
});

test("a translation without vectors is searched by keyword, and says nothing of it", async ({ page }) => {
  await page.goto(`/search?q=troubled&t=kjv`);
  await expect(results(page).first()).toBeVisible();
  await expect(filters(page).getByRole("radio")).toHaveCount(0);
  await expect(status(page)).toHaveText(/^\d+ verses? in the KJV\./);

  await page.goto(`/search?q=troubled&t=kjv&mode=meaning`);
  await expect(results(page).first().locator("mark").first()).toHaveText(/^troubl/);
});

test("odd input is harmless in every mode", async ({ page }) => {
  for (const each of ["meaning", "both"]) {
    for (const query of ["'; drop table passage_embedding; --", "water & | ! ( <->", '"unclosed phrase', ":*"]) {
      const response = await page.goto(`/search?q=${encodeURIComponent(query)}&mode=${each}`);
      expect(response?.status(), query).toBe(200);
      await expect(status(page)).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/\berror\b|Voyage|\bAI\b/i);
    }
  }
  await page.goto(`${ADDRESS}&mode=meaning`);
  await expect(results(page).first()).toContainText("anxiety");
});

test.describe("in the editor", () => {
  test.use({ storageState: OWNER_STATE });

  test("the Search tab has the same modes and filter, and inserts the whole passage", async ({ page }) => {
    await page.goto("/write");
    const { sidebar, title, passage } = editor(page);
    await title.fill("On anxious nights");
    await sidebar.getByRole("tab", { name: "Search" }).click();
    const panel = sidebar.getByRole("tabpanel", { name: "Search" });
    await panel.getByRole("searchbox", { name: "Search words" }).fill(QUERY);
    await panel.getByRole("button", { name: "Search" }).click();

    const hits = panel.getByRole("list", { name: "Search results" }).getByRole("listitem");
    await expect(hits.first()).toContainText("Psalm 94:17-20");
    await expect(panel.getByRole("radio", { name: "Both" })).toBeChecked();

    await panel.getByRole("radio", { name: "Keyword" }).check();
    await expect(panel.getByRole("status")).toHaveText("No verses match.");

    await panel.getByRole("radio", { name: "Meaning" }).check();
    await expect(hits.first()).toContainText("Psalm 94:17-20");
    await expect(panel.getByRole("status")).toHaveText(/^\d+ passages?\.$/);

    await panel.getByRole("combobox", { name: "Search in" }).selectOption({ label: "John" });
    await expect(hits.first()).toContainText("John");
    await panel.getByRole("combobox", { name: "Search in" }).selectOption({ label: "Psalms" });
    await expect(hits.first()).toContainText("Psalm 94:17-20");

    await panel.getByRole("button", { name: "Insert Psalm 94:17-20" }).click();
    await expect(passage("Psalm 94:17-20")).toBeVisible();
    await expect(passage("Psalm 94:17-20")).toContainText("When anxiety overwhelms me");
  });

  test("the Search tab has no modes in a translation without vectors", async ({ page }) => {
    await page.goto("/write");
    const { sidebar } = editor(page);
    await sidebar.getByRole("combobox", { name: "Study translation" }).selectOption({ label: "KJV" });
    await sidebar.getByRole("tab", { name: "Search" }).click();
    await expect(sidebar.getByRole("tabpanel", { name: "Search" }).getByRole("radio")).toHaveCount(0);
  });
});
