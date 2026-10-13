import { expect, test, type Page } from "@playwright/test";

// Journey 3: compare translations. A parallel view of two to four
// translations of the same passage, verses aligned. The fixture holds three
// translations, so four side by side is covered by unit tests only.

const table = (page: Page) => page.locator("table[data-parallel]");
const row = (page: Page, verseId: number) => table(page).locator(`[data-verse-row='${verseId}']`);
const cell = (page: Page, verseId: number, translationId: string) =>
  row(page, verseId).locator(`[data-translation='${translationId}']`);
const toggle = (page: Page, name: string) =>
  page.getByRole("toolbar", { name: "Translations" }).getByRole("button", { name });

test("pick translations and read them side by side", async ({ page }) => {
  await page.goto("/read/john-3.16-21");
  await expect(toggle(page, "Berean Standard Bible")).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(page, "World English Bible")).toHaveAttribute("aria-pressed", "false");
  await expect(table(page)).toHaveCount(0);

  // Two translations.
  await toggle(page, "World English Bible").click();
  await expect(page).toHaveURL("/read/john-3.16-21?t=bsb,web");
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "Verse",
    "BSBBerean Standard Bible",
    "WEBWorld English Bible",
  ]);
  await expect(table(page).locator("[data-verse-row]")).toHaveCount(6);

  // Three: each verse is one row with a cell per translation.
  await toggle(page, "King James Version").click();
  await expect(page).toHaveURL("/read/john-3.16-21?t=bsb,web,kjv");
  await expect(page.getByRole("heading", { level: 1, name: "John 3:16-21" })).toBeVisible();
  await expect(table(page).getByRole("columnheader")).toHaveCount(4);
  await expect(table(page).getByRole("rowheader")).toHaveText(["16", "17", "18", "19", "20", "21"]);

  await expect(cell(page, 43003016, "bsb")).toContainText("His one and only");
  await expect(cell(page, 43003016, "web")).toContainText("his only born");
  await expect(cell(page, 43003016, "kjv")).toContainText("his only begotten Son");
  await expect(cell(page, 43003021, "kjv")).toContainText("that they are wrought in God.");
  for (const id of ["bsb", "web", "kjv"]) await expect(cell(page, 43003016, id)).toBeVisible();

  // Aligned: the three cells of a verse start at the same height, side by side.
  const boxes = await Promise.all(
    ["bsb", "web", "kjv"].map((id) => cell(page, 43003019, id).boundingBox()),
  );
  expect(new Set(boxes.map((box) => Math.round(box!.y))).size).toBe(1);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);

  // Red-letter text in every translation that marks it.
  for (const id of ["bsb", "web", "kjv"]) {
    await expect(cell(page, 43003016, id).locator("[data-words-of-jesus]").first()).toBeVisible();
  }

  // Each translation keeps its own footnotes and attribution.
  await expect(cell(page, 43003016, "web").getByRole("link", { name: "Footnote a" })).toBeVisible();
  await expect(page.getByRole("region", { name: "WEB footnotes" })).toContainText("only born");
  await expect(page.getByRole("region", { name: "BSB footnotes" })).toContainText(
    "Or only begotten or unique",
  );
  await expect(page.locator("[data-attribution='bsb']")).toContainText("Berean Standard Bible");
  await expect(page.locator("[data-attribution='web']")).toContainText("World English Bible");
  await expect(page.locator("[data-attribution='kjv']")).toContainText("King James");

  // Back down to two, then one.
  await toggle(page, "Berean Standard Bible").click();
  await expect(page).toHaveURL("/read/john-3.16-21?t=web,kjv");
  await expect(table(page).getByRole("columnheader")).toHaveCount(3);
  await toggle(page, "King James Version").click();
  await expect(page).toHaveURL("/read/john-3.16-21?t=web");
  await expect(table(page)).toHaveCount(0);
  await expect(page.locator("[data-passage='web']")).toContainText("For God so loved the world");
  await expect(page.locator("[data-attribution='web']")).toBeVisible();
});

test("a parallel view has its own URL and survives a new lookup", async ({ page }) => {
  await page.goto("/read/psalm-23?t=kjv,bsb");
  await expect(table(page).getByRole("columnheader")).toHaveText([
    "Verse",
    "KJVKing James Version",
    "BSBBerean Standard Bible",
  ]);
  await expect(table(page).locator("[data-verse-row]")).toHaveCount(6);
  await expect(cell(page, 19023001, "bsb").getByRole("heading")).toHaveText(
    "The LORD Is My Shepherd",
  );

  await page.getByRole("textbox", { name: "Passage" }).fill("rom 8.1");
  await page.getByRole("textbox", { name: "Passage" }).press("Enter");
  await expect(page).toHaveURL("/read/romans-8.1?t=kjv,bsb");
  await expect(cell(page, 45008001, "kjv")).toContainText("There is therefore now no condemnation");
  await expect(cell(page, 45008001, "bsb")).toContainText("there is now no condemnation");
});

test("verses stay aligned when a translation leaves one out", async ({ page }) => {
  // The BSB has no John 5:4; the KJV does.
  await page.goto("/read/john-5.3-5?t=bsb,kjv");
  await expect(table(page).getByRole("rowheader")).toHaveText(["3", "4", "5"]);
  await expect(cell(page, 43005004, "bsb")).toHaveText("Not in the BSB");
  await expect(cell(page, 43005004, "kjv")).toContainText("For an angel went down");
  await expect(cell(page, 43005005, "bsb")).toContainText("thirty-eight years");
  await expect(cell(page, 43005005, "kjv")).toContainText("thirty and eight years");
});

test("a paragraph that starts inside a verse is a paragraph in both views", async ({ page }) => {
  // WEB John 1:21 has three changes of speaker, each a new paragraph.
  await page.goto("/read/john-1.19-23?t=web");
  const paragraphs = page.locator("[data-passage='web'] p:has([data-verse-id])");
  await expect(paragraphs).toHaveCount(8);
  await expect(paragraphs.nth(3)).toHaveText("He said, “I am not.”");
  await expect(page.locator("[data-passage='web'] [data-line]")).toHaveCount(0);

  await page.goto("/read/john-1.19-23?t=web,kjv");
  await expect(cell(page, 43001021, "web").locator("p")).toHaveCount(4);
  await expect(cell(page, 43001021, "kjv").locator("p")).toHaveCount(1);
});
