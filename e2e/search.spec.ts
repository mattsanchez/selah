import { expect, test, type Page } from "@playwright/test";

// Journey 4, keyword half: search the Bible by keyword, filter by book or
// testament, and open a result in the reader. Meaning search is M10.

const box = (page: Page) => page.getByRole("textbox", { name: "Passage or search" });
const results = (page: Page) => page.locator("[data-result]");
const status = (page: Page) => page.locator("[data-search-status]");
const filters = (page: Page) => page.getByRole("form", { name: "Narrow the search" });
const scope = (page: Page) => filters(page).getByRole("combobox", { name: "Search in" });
const references = (page: Page) => results(page).getByRole("heading").getByRole("link");

async function search(page: Page, query: string) {
  await page.goto("/search");
  await box(page).fill(query);
  await box(page).press("Enter");
}

test("search for living water, narrow it, and open a result in the reader", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Search the Bible" }).click();
  await expect(page).toHaveURL("/search");
  await box(page).fill("living water");
  await box(page).press("Enter");

  // Results in the default translation, best first, with the matches marked.
  await expect(page).toHaveURL("/search?q=living+water");
  await expect(page).toHaveTitle("living water · Search · Selah");
  await expect(box(page)).toHaveValue("living water");
  await expect(status(page)).toHaveText("4 verses in the BSB.");
  await expect(references(page)).toHaveText([
    "John 4:10, Berean Standard Bible",
    "John 4:11, Berean Standard Bible",
    "John 7:38, Berean Standard Bible",
    "John 7:37, Berean Standard Bible",
  ]);
  const hit = results(page).first();
  await expect(hit).toContainText("He would have given you living water.");
  await expect(hit.locator("mark")).toHaveText(["living", "water"]);
  for (const mark of await hit.locator("mark").all()) await expect(mark).toBeVisible();
  // John 7:37 is found by the heading printed over it.
  await expect(results(page).nth(3).locator("[data-heading='section'] mark")).toHaveText([
    "Living",
    "Water",
  ]);
  await expect(page.locator("[data-attribution='bsb']")).toContainText(
    "Berean Standard Bible (BSB), public domain",
  );

  // Every translation: each hit says where it is from, and each is credited.
  await filters(page).getByRole("button", { name: "Search all" }).click();
  await expect(page).toHaveURL("/search?q=living+water&t=all");
  await expect(status(page)).toHaveText("10 verses in all translations.");
  await expect(results(page)).toHaveCount(10);
  await expect(page.locator("[data-result='43007038'][data-translation='kjv']")).toContainText(
    "out of his belly shall flow rivers of living water.",
  );
  for (const id of ["bsb", "web", "kjv"]) {
    await expect(page.locator(`[data-attribution='${id}']`)).toBeVisible();
  }

  // By testament, then by book.
  await scope(page).selectOption({ label: "Old Testament" });
  await expect(page).toHaveURL("/search?q=living+water&t=all&in=ot");
  await expect(status(page)).toHaveText("No verses match in the Old Testament, all translations.");
  await expect(results(page)).toHaveCount(0);

  await scope(page).selectOption({ label: "New Testament" });
  await expect(page).toHaveURL("/search?q=living+water&t=all&in=nt");
  await expect(results(page)).toHaveCount(10);

  await scope(page).selectOption({ label: "Romans" });
  await expect(page).toHaveURL("/search?q=living+water&t=all&in=romans");
  await expect(status(page)).toHaveText("No verses match in Romans, all translations.");

  await scope(page).selectOption({ label: "John" });
  await expect(page).toHaveURL("/search?q=living+water&t=all&in=john");
  await expect(status(page)).toHaveText("10 verses in John, all translations.");

  // A result opens that verse in the reader, in the translation it was found in.
  await page
    .locator("[data-result='43007038'][data-translation='web']")
    .getByRole("link", { name: "John 7:38" })
    .click();
  await expect(page).toHaveURL("/read/john-7.38?t=web");
  await expect(page.getByRole("heading", { level: 1, name: "John 7:38" })).toBeVisible();
  await expect(page.locator("[data-passage='web'] [data-verse-id='43007038']")).toContainText(
    "from within him will flow rivers of living water.",
  );

  // And the same box searches again from there, in the same translation.
  await box(page).fill("bread of life");
  await box(page).press("Enter");
  await expect(page).toHaveURL("/search?q=bread+of+life&t=web");
  await expect(results(page).first()).toHaveAttribute("data-translation", "web");
});

test("a reference typed in the search box goes straight to the reader", async ({ page }) => {
  await search(page, "John 4:10");
  await expect(page).toHaveURL("/read/john-4.10");
  await expect(page.getByRole("heading", { level: 1, name: "John 4:10" })).toBeVisible();
  await expect(page.locator("[data-passage='bsb']")).toContainText("living water");

  await search(page, "ps23");
  await expect(page).toHaveURL("/read/psalm-23");

  // A whole book, by its full name.
  await page.goto("/search?q=Romans&t=kjv");
  await expect(page).toHaveURL("/read/romans?t=kjv");

  // The old address of the reference box still works, for words too.
  await page.goto("/read?q=jn3.16");
  await expect(page).toHaveURL("/read/john-3.16");
  await page.goto("/read?q=living+water");
  await expect(page).toHaveURL("/search?q=living+water");
  await expect(results(page)).toHaveCount(4);
});

test("filters narrow a search by testament, book and translation", async ({ page }) => {
  await search(page, "shepherd");
  await expect(status(page)).toHaveText("13 verses in the BSB.");

  await scope(page).selectOption({ label: "Old Testament" });
  await expect(status(page)).toHaveText("6 verses in the Old Testament, the BSB.");
  for (const reference of await references(page).allTextContents()) {
    expect(reference).toMatch(/^Psalm /);
  }

  await scope(page).selectOption({ label: "John" });
  await expect(status(page)).toHaveText("7 verses in John, the BSB.");
  await expect(references(page).first()).toContainText("John 10:");

  // Another translation instead of the default.
  await filters(page).getByRole("checkbox", { name: "King James Version" }).check();
  await expect(page).toHaveURL("/search?q=shepherd&t=bsb,kjv&in=john");
  await expect(status(page)).toHaveText("12 verses in John, the BSB, KJV.");
  await filters(page).getByRole("checkbox", { name: "Berean Standard Bible" }).uncheck();
  await expect(page).toHaveURL("/search?q=shepherd&t=kjv&in=john");
  await expect(status(page)).toHaveText("5 verses in John, the KJV.");
  await expect(results(page)).toHaveCount(5);
  await expect(results(page).first()).toHaveAttribute("data-translation", "kjv");
  // The last translation cannot be unticked.
  await expect(filters(page).getByRole("checkbox", { name: "King James Version" })).toBeDisabled();

  // The URL is the search: opening it again shows the same thing.
  await page.goto("/search?q=shepherd&t=kjv&in=john");
  await expect(scope(page)).toHaveValue("john");
  await expect(filters(page).getByRole("checkbox", { name: "King James Version" })).toBeChecked();
  await expect(results(page)).toHaveCount(5);
});

test("phrases, word forms, exclusions and psalm titles", async ({ page }) => {
  // A quoted phrase: the words together, not merely all in the verse.
  await search(page, "word of God");
  await expect(status(page)).toHaveText("15 verses in the BSB.");
  await search(page, "“word of God”");
  await expect(status(page)).toHaveText("6 verses in the BSB.");
  // Word forms count ("words of God"), and a word too common to be indexed,
  // like "of", stands for any one word ("the Word was God").
  for (const hit of await results(page).all()) await expect(hit).toContainText(/words? \w+ God/i);
  await expect(results(page).first().locator("mark")).toHaveText([/^words?$/i, "God"]);

  // Word forms: "believing" finds "believe", "believes" and "believed".
  await page.goto("/search?q=believing&in=john");
  const marks = (await results(page).locator("mark").allTextContents()).map((mark) =>
    mark.toLowerCase(),
  );
  expect(new Set(marks).size).toBeGreaterThan(1);
  expect(marks).toContain("believes");

  // A word left out.
  await page.goto("/search?q=living+water+-well");
  await expect(status(page)).toHaveText("3 verses in the BSB.");
  await expect(page.locator("[data-result='43004011']")).toHaveCount(0);

  // Words of a psalm's title find the psalm.
  await page.goto("/search?q=maskil+korah");
  await expect(references(page).first()).toContainText("Psalm 42:1");
  await expect(
    results(page).first().locator("[data-heading='superscription'] mark"),
  ).toHaveText(["Maskil", "Korah"]);

  // Poetry is shown on one line.
  await page.goto("/search?q=“I+shall+not+want”");
  await expect(results(page).first()).toContainText("The LORD is my shepherd; I shall not want.");
});

test("long result lists are paged", async ({ page }) => {
  await search(page, "love");
  await expect(status(page)).toHaveText("223 verses in the BSB. Showing 1–20.");
  await expect(results(page)).toHaveCount(20);
  const pages = page.getByRole("navigation", { name: "Pages of results" });
  await expect(pages).toContainText("Page 1 of 12");
  await expect(pages.getByRole("link", { name: "Previous" })).toHaveCount(0);
  const firstOnPageOne = await references(page).first().textContent();

  await pages.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL("/search?q=love&page=2");
  await expect(status(page)).toHaveText("223 verses in the BSB. Showing 21–40.");
  await expect(references(page).first()).not.toHaveText(firstOnPageOne!);

  await page.goto("/search?q=love&page=12");
  await expect(status(page)).toHaveText("223 verses in the BSB. Showing 221–223.");
  await expect(results(page)).toHaveCount(3);
  await expect(pages.getByRole("link", { name: "Next" })).toHaveCount(0);

  // A page past the end goes to the last one; a filter starts again at the first.
  await page.goto("/search?q=love&page=99");
  await expect(page).toHaveURL("/search?q=love&page=12");
  await scope(page).selectOption({ label: "Romans" });
  await expect(page).toHaveURL("/search?q=love&in=romans");
  await expect(status(page)).toHaveText("18 verses in Romans, the BSB.");
});

test("searches with nothing to find say so, and odd input is harmless", async ({ page }) => {
  await search(page, "xylophone");
  await expect(status(page)).toHaveText("No verses match in the BSB.");
  await expect(results(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Search all translations" }).click();
  await expect(page).toHaveURL("/search?q=xylophone&t=all");

  // Only words too common to be indexed.
  await search(page, "the and of");
  await expect(status(page)).toContainText("too common");

  // Nothing here is syntax to the database.
  for (const query of ["'; drop table verse; --", "water & | ! ( <->", '"unclosed phrase', ":*"]) {
    const response = await page.goto(`/search?q=${encodeURIComponent(query)}`);
    expect(response?.status(), query).toBe(200);
    await expect(status(page)).toBeVisible();
    await expect(box(page)).toHaveValue(query);
  }
  await page.goto("/search?q=living+water");
  await expect(results(page)).toHaveCount(4);

  // An empty box.
  await page.goto("/search?q=");
  await expect(page.getByRole("heading", { level: 1, name: "Search the Bible" })).toBeVisible();
  await page.getByRole("link", { name: "living water" }).click();
  await expect(page).toHaveURL("/search?q=living+water");

  // A reference that does not exist is explained, not searched for.
  await search(page, "John 22");
  await expect(page.getByRole("alert").filter({ hasText: "John" })).toHaveText(
    "John has 21 chapters; there is no chapter 22.",
  );

  // A word that is also short for a book is searched for, and the book offered.
  await search(page, "judge");
  await expect(results(page).first()).toBeVisible();
  await page.getByRole("link", { name: "Read Judges" }).click();
  await expect(page).toHaveURL("/read/judges");
});
