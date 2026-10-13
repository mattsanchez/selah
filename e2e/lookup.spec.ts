import { expect, test, type Page } from "@playwright/test";

// Journey 2: look up a passage. Type a reference and see it in the default
// translation, with verse numbers, headings and footnotes.

async function lookUp(page: Page, reference: string) {
  await page.goto("/read");
  await page.getByRole("textbox", { name: "Passage" }).fill(reference);
  await page.getByRole("textbox", { name: "Passage" }).press("Enter");
}

const passage = (page: Page) => page.locator("[data-passage='bsb']");
const verseNumbers = (page: Page) => passage(page).locator("[data-verse-number]");

test("John 3:16-21 shows the passage with verse numbers and footnotes", async ({ page }) => {
  await lookUp(page, "John 3:16-21");

  await expect(page).toHaveURL("/read/john-3.16-21");
  await expect(page).toHaveTitle("John 3:16-21 · Selah");
  await expect(page.getByRole("heading", { level: 1, name: "John 3:16-21" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Passage" })).toHaveValue("John 3:16-21");

  await expect(verseNumbers(page)).toHaveText(["16", "17", "18", "19", "20", "21"]);
  for (const number of await verseNumbers(page).all()) await expect(number).toBeVisible();
  await expect(passage(page)).toContainText(
    "For God so loved the world that He gave His one and only",
  );
  await expect(passage(page)).toContainText("has been accomplished in God.”");
  // The BSB starts a new paragraph at verses 16 and 19.
  await expect(passage(page).locator("p:has([data-verse-id])")).toHaveCount(2);

  // Footnotes: a marker in the text, linked to the note below it and back.
  const marker = passage(page).getByRole("link", { name: "Footnote a", exact: true });
  await expect(marker).toBeVisible();
  const notes = page.getByRole("region", { name: "Footnotes" });
  await expect(notes.getByRole("listitem")).toHaveCount(2);
  const note = notes.getByRole("listitem").filter({ hasText: "Or only begotten or unique" });
  await expect(note).toBeVisible();
  await marker.click();
  await expect(page).toHaveURL(/#bsb-note-0$/);
  await expect(note).toBeInViewport();
  await note.getByRole("link", { name: "Back to footnote a in the text" }).click();
  await expect(page).toHaveURL(/#bsb-ref-0$/);

  await expect(page.locator("[data-attribution='bsb']")).toContainText(
    "Berean Standard Bible (BSB), public domain",
  );
});

test("jn3.16 resolves to John 3:16", async ({ page }) => {
  await lookUp(page, "jn3.16");

  await expect(page).toHaveURL("/read/john-3.16");
  await expect(page.getByRole("heading", { level: 1, name: "John 3:16" })).toBeVisible();
  await expect(verseNumbers(page)).toHaveText(["16"]);
  await expect(verseNumbers(page)).toBeVisible();
  await expect(passage(page)).toContainText("For God so loved the world");
  await expect(passage(page)).not.toContainText("For God did not send His Son");
  await expect(passage(page).getByRole("link", { name: "Footnote a", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Footnotes" })).toContainText(
    "Or only begotten or unique",
  );
  await expect(page.locator("[data-attribution='bsb']")).toBeVisible();
});

test("Ps 23 shows the psalm with its heading, title, lines and footnotes", async ({ page }) => {
  await lookUp(page, "Ps 23");

  await expect(page).toHaveURL("/read/psalm-23");
  await expect(page.getByRole("heading", { level: 1, name: "Psalm 23" })).toBeVisible();

  await expect(
    passage(page).getByRole("heading", { name: "The LORD Is My Shepherd" }),
  ).toBeVisible();
  await expect(passage(page).locator("[data-heading='superscription']")).toHaveText(
    "A Psalm of David.",
  );
  await expect(verseNumbers(page)).toHaveText(["1", "2", "3", "4", "5", "6"]);

  // Poetry keeps its lines, and the BSB's two stanzas are two paragraphs.
  await expect(passage(page).locator("p:has([data-verse-id])")).toHaveCount(2);
  const lines = passage(page).locator("[data-line]");
  await expect(lines).toHaveCount(19);
  await expect(lines.nth(1)).toHaveText("I shall not want.");

  await expect(passage(page).getByRole("link", { name: /^Footnote [abc]$/ })).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Footnotes" })).toContainText(
    "Or the valley of deep darkness",
  );
  await expect(page.locator("[data-attribution='bsb']")).toBeVisible();
});

test("a passage has its own URL, and other spellings redirect to it", async ({ page }) => {
  await page.goto("/read/john-3.16-21");
  await expect(page.getByRole("heading", { level: 1, name: "John 3:16-21" })).toBeVisible();
  await expect(verseNumbers(page)).toHaveCount(6);

  await page.goto("/read/Jn%203:16-21");
  await expect(page).toHaveURL("/read/john-3.16-21");

  await page.goto("/read/john-3.16-18,22;4.1-3");
  await expect(
    page.getByRole("heading", { level: 1, name: "John 3:16-18, 22; 4:1-3" }),
  ).toBeVisible();
  await expect(verseNumbers(page)).toHaveText(["16", "17", "18", "22", "1", "2", "3"]);
  await expect(passage(page).getByRole("heading", { name: "John 4" })).toBeVisible();
});

test("a reference that cannot be resolved says why", async ({ page }) => {
  await lookUp(page, "John 22");
  await expect(page.getByRole("alert").filter({ hasText: "John" })).toHaveText(
    "John has 21 chapters; there is no chapter 22.",
  );
  await expect(page.getByRole("textbox", { name: "Passage" })).toHaveValue("John 22");

  await lookUp(page, "Hezekiah 3:16");
  await expect(page.getByRole("alert").filter({ hasText: "book" })).toHaveText(
    "No book of the Bible is called “hezekiah”.",
  );

  // The box can be used again from the error.
  await page.getByRole("textbox", { name: "Passage" }).fill("rom 8:1");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page).toHaveURL("/read/romans-8.1");
  await expect(passage(page)).toContainText("there is now no condemnation");
});

test("a verse the translation leaves out is passed over, or explained", async ({ page }) => {
  // The BSB has no John 5:4.
  await page.goto("/read/john-5.3-5");
  await expect(verseNumbers(page)).toHaveText(["3", "5"]);

  await page.goto("/read/john-5.4");
  await expect(page.getByRole("status")).toContainText(
    "The Berean Standard Bible has no text for John 5:4.",
  );
});

test("the home page leads to the reader", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Read the Bible" }).click();
  await expect(page).toHaveURL("/read");
  await expect(page.getByRole("textbox", { name: "Passage" })).toBeVisible();
});
