import { expect, test, type Page } from "@playwright/test";

// Journey 5: study a verse. Click a verse and a side panel opens with ranked
// cross references, the verse's footnotes, public-domain commentary and
// Tyndale Open Study Notes, each with its attribution.

const panel = (page: Page) => page.getByRole("complementary", { name: "John 3:16" });
const section = (page: Page, name: string) =>
  panel(page).locator(`[data-study-section='${name}']`);
const verse = (page: Page, id: number) => page.locator(`[data-verse-id='${id}']`).first();

test("clicking a verse opens the study panel on it", async ({ page }) => {
  await page.goto("/read/john-3.16-21");
  await expect(page.getByRole("complementary")).toHaveCount(0);

  await verse(page, 43003016).getByText("For God so loved the world").click();
  await expect(page).toHaveURL("/read/john-3.16-21?v=john-3.16");
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText("John 3:16");
  await expect(verse(page, 43003016)).toHaveAttribute("data-selected", "");
  await expect(verse(page, 43003017)).not.toHaveAttribute("data-selected");

  // Cross references: ranked by votes, quoted in the translation on show,
  // and linked into the reader.
  const crossReferences = section(page, "cross-references");
  const items = crossReferences.locator("[data-cross-reference]");
  await expect(items.first()).toContainText("Romans 5:8");
  await expect(items.first()).toContainText("But God proves His love for us in this");
  const votes = await items.evaluateAll((all) => all.map((item) => Number(item.dataset.votes)));
  expect(votes.length).toBeGreaterThan(10);
  expect(votes).toEqual([...votes].sort((a, b) => b - a));
  expect(votes[0]).toBeGreaterThan(votes.at(-1)!);
  await expect(crossReferences.locator("[data-attribution]")).toContainText(
    "Cross references from OpenBible.info",
  );
  await expect(crossReferences.locator("[data-attribution]")).toContainText("CC BY 4.0");

  // The verse's footnote, with the marker it has in the text.
  const footnotes = section(page, "footnotes");
  await expect(footnotes).toContainText("Or only begotten or unique");
  await expect(footnotes.getByRole("link", { name: "Footnote a in the text" })).toBeVisible();
  await expect(footnotes).toContainText("Berean Standard Bible");

  // Commentary, grouped by source, each with its attribution.
  const commentary = section(page, "commentary");
  const sources = {
    "matthew-henry": ["Matthew Henry", "Christ's Interview with Nicodemus", "Matthew Henry, Commentary"],
    "jamieson-fausset-brown": ["Jamieson, Fausset and Brown", "And as Moses", "Robert Jamieson"],
    "adam-clarke": ["Adam Clarke", "For God so loved the world", "Adam Clarke, Commentary"],
  };
  for (const [id, [name, text, attribution]] of Object.entries(sources)) {
    const source = commentary.locator(`[data-source='${id}']`);
    await expect(source.locator("> h4")).toContainText(name);
    await expect(source).toContainText(text);
    await expect(source.locator("[data-attribution]")).toContainText(attribution);
    await expect(source.locator("[data-attribution]")).toContainText("Public domain");
  }
  // Each entry says what it is on: Henry's is his section, Clarke's the verse.
  await expect(commentary.locator("[data-source='matthew-henry'] [data-entry]").first()).toContainText(
    "On John 3:1-21",
  );
  await expect(commentary.locator("[data-source='adam-clarke'] [data-entry]").first()).toContainText(
    "On John 3:16",
  );

  // Tyndale Open Study Notes, under their own heading.
  const notes = section(page, "study-notes").locator("[data-source='tyndale']");
  await expect(notes).toContainText("The truth that God loved the world is basic");
  await expect(notes.locator("[data-attribution]")).toContainText(
    "Adapted from Tyndale Open Study Notes",
  );
  await expect(notes.locator("[data-attribution]")).toContainText("CC BY-SA 4.0");

  // Nothing of the sources' own markup reaches the page.
  await expect(panel(page).locator("script, style, iframe, [onclick]")).toHaveCount(0);

  // A cross reference opens in the reader.
  await items.first().getByRole("link", { name: "Romans 5:8" }).click();
  await expect(page).toHaveURL("/read/romans-5.8");
  await expect(page.getByRole("heading", { level: 1, name: "Romans 5:8" })).toBeVisible();
});

test("a studied verse has its own address, and long commentary opens in full", async ({ page }) => {
  await page.goto("/read/john-3?v=john-3.16");
  await expect(panel(page)).toBeVisible();
  await expect(page.locator("[data-verse-link='43003016']")).toHaveAttribute("aria-current", "true");

  const henry = panel(page).locator("[data-source='matthew-henry']");
  await expect(henry).not.toContainText("as the brazen serpent healed the Israelites");
  await henry.getByRole("link", { name: "Read in full" }).first().click();
  await expect(page).toHaveURL(/\/read\/john-3\?v=john-3\.16&full=matthew-henry/);
  await expect(henry).toContainText("as the brazen serpent healed the Israelites");
  await henry.getByRole("link", { name: "Show less" }).click();
  await expect(page).toHaveURL("/read/john-3?v=john-3.16");

  // A verse outside the passage selects nothing.
  await page.goto("/read/john-3.16-21?v=john-4.1");
  await expect(page.getByRole("complementary")).toHaveCount(0);
});

test("the panel works from the keyboard", async ({ page }) => {
  await page.goto("/read/john-3.16-21");
  const number = page.getByRole("link", { name: "Study John 3:17" });
  await number.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/read/john-3.16-21?v=john-3.17");
  const open = page.getByRole("complementary", { name: "John 3:17" });
  await expect(open).toBeVisible();
  await expect(open).toBeFocused();

  // Clicking another verse moves the panel; Escape closes it and gives the
  // verse back the focus.
  await verse(page, 43003018).click();
  await expect(page.getByRole("complementary", { name: "John 3:18" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/read/john-3.16-21");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Study John 3:18" })).toBeFocused();

  // So does the Close link.
  await verse(page, 43003016).click();
  await panel(page).getByRole("link", { name: "Close the study panel" }).click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
});

test("a footnote marker in a verse still goes to its footnote", async ({ page }) => {
  await page.goto("/read/john-3.16-21");
  await page.locator("[data-passage='bsb']").getByRole("link", { name: "Footnote a", exact: true }).click();
  await expect(page).toHaveURL(/#bsb-note-0$/);
  await expect(page.getByRole("complementary")).toHaveCount(0);
});

test("in the parallel view the panel covers every translation on show", async ({ page }) => {
  await page.goto("/read/john-3.16-21?t=bsb,web");
  await page.locator("[data-verse-row='43003016'] td[data-translation='web']").click();

  await expect(page).toHaveURL("/read/john-3.16-21?t=bsb,web&v=john-3.16");
  await expect(panel(page)).toBeVisible();
  await expect(page.locator("[data-verse-row='43003016']")).toHaveAttribute("data-selected", "");

  // Cross references are quoted from the first translation; footnotes are
  // listed for each.
  await expect(section(page, "cross-references").locator("[data-attribution]")).toContainText(
    "Quoted from the BSB",
  );
  const footnotes = section(page, "footnotes");
  await expect(footnotes.locator("[data-footnotes='bsb']")).toContainText("Or only begotten");
  await expect(footnotes.locator("[data-footnotes='web']")).toContainText("only born");
  await expect(section(page, "study-notes")).toContainText("Tyndale Open Study Notes");

  // Choosing another translation keeps the verse.
  await page.getByRole("button", { name: "King James Version" }).click();
  await expect(page).toHaveURL("/read/john-3.16-21?t=bsb,web,kjv&v=john-3.16");
  await expect(panel(page)).toBeVisible();
});
