import { expect, request, test, type Locator, type Page } from "@playwright/test";

import { seedHighlights } from "./db";
import { OWNER_STATE } from "./owner";

// Journey 6: highlight verses. Select verses, pick a color, add an optional
// note; highlights show in the reader across sessions and translations, and
// in "My highlights", filterable by color, book and date.
//
// The fixture server's specs share one database and run in parallel, so each
// test here highlights a passage of its own and looks for its own highlight
// by its reference; owner.setup.ts clears the owner's items before a run.

const GREEN = "rgb(195, 245, 208)";
const YELLOW = "rgb(253, 240, 138)";
const PINK = "rgb(252, 217, 236)";

const verse = (page: Page, id: number) => page.locator(`[data-verse-id='${id}']`).first();
const row = (page: Page, id: number) => page.locator(`[data-verse-row='${id}']`);
const panel = (page: Page) => page.getByRole("complementary");
// A highlight's card, in the panel or in the list, by the verses it is on.
const card = (scope: Page | Locator, reference: string) => {
  const page = "goto" in scope ? scope : scope.page();
  return scope
    .locator("[data-highlight-item]")
    .filter({ has: page.getByRole("heading", { name: reference, exact: true }) });
};
// The form for a new highlight, in the panel.
const newHighlight = (page: Page) => panel(page).getByRole("group", { name: /^Highlight / });
const color = (form: Locator, name: string) =>
  form.locator("label.highlight-choice").filter({ hasText: name });

// A point on the words of a verse: not its number, which is a link, nor a
// footnote marker. A verse's text wraps over several lines, so the middle of
// its box may be another verse.
async function wordsOf(
  page: Page,
  id: number,
  block: ScrollLogicalPosition = "center",
): Promise<{ x: number; y: number }> {
  const point = await verse(page, id).evaluate((element, block) => {
    element.scrollIntoView({ block });
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest("a, sup")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      return { x: rect.x + Math.min(rect.width / 2, 40), y: rect.y + rect.height / 2 };
    }
    return null;
  }, block);
  if (!point) throw new Error(`Verse ${id} has no text on the page`);
  return point;
}

async function clickVerse(page: Page, id: number, modifier?: "Shift" | "ControlOrMeta") {
  const { x, y } = await wordsOf(page, id);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(x, y);
  if (modifier) await page.keyboard.up(modifier);
}

function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test.describe("the signed-in owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("journey 6: highlights verses and finds them again", async ({ page, browser }) => {
    const note = "All things, for good";

    // Select a run of verses: click the first, Shift-click the last.
    await page.goto("/read/romans-8.28-30");
    await clickVerse(page, 45008028);
    await expect(page).toHaveURL("/read/romans-8.28-30?v=romans-8.28");
    await expect(panel(page)).toBeVisible();
    await clickVerse(page, 45008029, "Shift");
    await expect(page).toHaveURL("/read/romans-8.28-30?v=romans-8.28-29");
    await expect(page.getByRole("complementary", { name: "Romans 8:28-29" })).toBeVisible();
    await expect(verse(page, 45008028)).toHaveAttribute("data-selected", "");
    await expect(verse(page, 45008029)).toHaveAttribute("data-selected", "");
    await expect(verse(page, 45008030)).not.toHaveAttribute("data-selected");
    // The same selection still studies: the panel says of which verse.
    await expect(panel(page).locator("[data-studied-verse]")).toContainText("Romans 8:28");
    await expect(panel(page).locator("[data-study-section='cross-references']")).toBeVisible();

    // Pick a color, add a note, highlight.
    const form = newHighlight(page);
    await expect(form.getByRole("radio", { name: "Yellow" })).toBeChecked();
    await color(form, "Green").click();
    await expect(form.getByRole("radio", { name: "Green" })).toBeChecked();
    await form.getByRole("textbox", { name: "Note (optional)" }).fill(note);
    await form.getByRole("button", { name: "Highlight" }).click();

    // The selection is gone and the highlight is what shows.
    await expect(page).toHaveURL("/read/romans-8.28-30");
    await expect(panel(page)).toHaveCount(0);
    for (const id of [45008028, 45008029]) {
      await expect(verse(page, id)).toHaveAttribute("data-highlight", "green");
      await expect(verse(page, id)).toHaveCSS("background-color", GREEN);
    }
    await expect(verse(page, 45008030)).not.toHaveAttribute("data-highlight");

    // After a reload, and in another session.
    await page.reload();
    await expect(verse(page, 45008028)).toHaveAttribute("data-highlight", "green");
    const later = await browser.newContext({ storageState: OWNER_STATE });
    const laterPage = await later.newPage();
    await laterPage.goto("/read/romans-8");
    await expect(verse(laterPage, 45008029)).toHaveAttribute("data-highlight", "green");
    await expect(verse(laterPage, 45008027)).not.toHaveAttribute("data-highlight");
    await later.close();

    // In another translation, and side by side.
    await page.goto("/read/romans-8.28-30?t=kjv");
    await expect(page.locator("[data-passage='kjv']")).toContainText("all things work together for good");
    await expect(verse(page, 45008028)).toHaveCSS("background-color", GREEN);
    await expect(verse(page, 45008030)).not.toHaveAttribute("data-highlight");
    await page.goto("/read/romans-8.28-30?t=bsb,web");
    await expect(row(page, 45008028)).toHaveAttribute("data-highlight", "green");
    for (const translation of ["bsb", "web"]) {
      await expect(
        row(page, 45008029).locator(`td[data-translation='${translation}'] [data-verse-id]`).first(),
      ).toHaveCSS("background-color", GREEN);
    }
    await expect(row(page, 45008030)).not.toHaveAttribute("data-highlight");

    // The note is reached from the text.
    await page.goto("/read/romans-8.28-30");
    const marker = page.getByRole("link", { name: `Note on Romans 8:28-29: ${note}` });
    await expect(marker).toHaveAttribute("title", note);
    await marker.click();
    await expect(page).toHaveURL("/read/romans-8.28-30?v=romans-8.28-29");
    const inPanel = card(panel(page), "Romans 8:28-29");
    await expect(inPanel).toContainText(note);
    await expect(inPanel).toContainText("Green");
    await expect(inPanel).toContainText("Private");
    // A selected verse keeps its highlight, and is marked another way.
    await expect(verse(page, 45008028)).toHaveCSS("background-color", GREEN);
    await expect(verse(page, 45008028)).toHaveCSS("text-decoration-line", "underline");

    // "My highlights": reference, verses, color, note and date.
    await page.getByRole("navigation", { name: "Owner" }).getByRole("link", { name: "My highlights" }).click();
    await expect(page).toHaveURL("/highlights");
    await expect(page.getByRole("heading", { level: 1, name: "My highlights" })).toBeVisible();
    const mine = card(page, "Romans 8:28-29");
    await expect(mine).toHaveCount(1);
    await expect(mine.locator("[data-highlight-quote]")).toContainText(
      "And we know that God works all things together for the good of those who love Him",
    );
    await expect(mine.locator("[data-highlight-quote]")).toContainText("BSB");
    await expect(mine.locator("[data-highlight-color='green']")).toHaveText("Green");
    await expect(mine.locator("[data-highlight-note-text]")).toContainText(note);
    await expect(mine.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
    await expect(page.locator("[data-attribution='bsb']")).toBeVisible();

    // Filter by color.
    const colors = page.getByRole("navigation", { name: "Filter by color" });
    await colors.getByRole("link", { name: "Green" }).click();
    await expect(page).toHaveURL("/highlights?color=green");
    await expect(mine).toHaveCount(1);
    await colors.getByRole("link", { name: "Yellow" }).click();
    await expect(page).toHaveURL("/highlights?color=yellow");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(mine).toHaveCount(0);
    await colors.getByRole("link", { name: "All colors" }).click();
    await expect(page).toHaveURL("/highlights");

    // By book.
    const filters = page.getByRole("form", { name: "Filter by book and date" });
    await filters.getByLabel("Book").selectOption({ label: "Romans" });
    await filters.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/\/highlights\?book=romans/);
    await expect(mine).toHaveCount(1);
    await expect(page.locator("[data-highlight-item]").filter({ hasText: /^(John|Psalms?) / })).toHaveCount(0);
    await page.goto("/highlights?book=john");
    await expect(page.locator("[data-highlights-status]")).toBeVisible();
    await expect(mine).toHaveCount(0);

    // By date.
    await page.goto("/highlights");
    await filters.getByLabel("From").fill(day(-1));
    await filters.getByLabel("To").fill(day(1));
    await filters.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(`/highlights?from=${day(-1)}&to=${day(1)}`);
    await expect(mine).toHaveCount(1);
    await filters.getByLabel("From").fill("");
    await filters.getByLabel("To").fill(day(-2));
    await filters.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(`/highlights?to=${day(-2)}`);
    await expect(page.locator("[data-highlights-status]")).toHaveText("No highlights match these filters.");
    await expect(mine).toHaveCount(0);
    await page.goto(`/highlights?from=${day(2)}`);
    await expect(mine).toHaveCount(0);

    // All three at once, and back to the reader from the list.
    await page.goto(`/highlights?color=green&book=romans&from=${day(-1)}&to=${day(1)}`);
    await expect(mine).toHaveCount(1);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL("/highlights");
    await mine.getByRole("link", { name: "Romans 8:28-29" }).click();
    await expect(page).toHaveURL("/read/romans-8.28-29");
    await expect(verse(page, 45008028)).toHaveAttribute("data-highlight", "green");

    // A visitor who is not signed in sees neither the highlight nor any way
    // to make one.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto("/read/romans-8.28-30");
    await expect(visitorPage.locator("[data-passage='bsb']")).toContainText("God works all things together");
    await expect(visitorPage.locator("[data-highlight]")).toHaveCount(0);
    await expect(visitorPage.locator("[data-highlight-note]")).toHaveCount(0);
    expect(await visitorPage.content()).not.toContain(note);
    await visitorPage.goto("/read/romans-8.28-30?v=romans-8.28-29&add=1");
    const visitorPanel = visitorPage.getByRole("complementary", { name: "Romans 8:28-29" });
    await expect(visitorPanel.locator("[data-study-section='cross-references']")).toBeVisible();
    await expect(visitorPanel.locator("[data-study-section='highlight']")).toHaveCount(0);
    await expect(visitorPage.getByRole("button", { name: "Highlight" })).toHaveCount(0);
    await expect(visitorPage.getByRole("radio")).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: "Select more verses" })).toHaveCount(0);
    await expect(visitorPage.locator("[data-adding-verses]")).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: "My highlights" })).toHaveCount(0);
    expect(await visitorPage.content()).not.toContain(note);
    await visitorPage.goto("/highlights?color=green");
    await expect(visitorPage).toHaveURL("/sign-in?next=%2Fhighlights%3Fcolor%3Dgreen");
    await visitor.close();
  });

  test("highlights verses that are apart, then changes and deletes the highlight in the reader", async ({
    page,
  }) => {
    await page.goto("/read/john-1.1-5");
    await clickVerse(page, 43001001);
    await expect(page).toHaveURL("/read/john-1.1-5?v=john-1.1");
    // Ctrl or Command adds a verse; again takes it away.
    await clickVerse(page, 43001003, "ControlOrMeta");
    await expect(page).toHaveURL("/read/john-1.1-5?v=john-1.1,3");
    await clickVerse(page, 43001005, "ControlOrMeta");
    await expect(page).toHaveURL("/read/john-1.1-5?v=john-1.1,3,5");
    await clickVerse(page, 43001005, "ControlOrMeta");
    await expect(page).toHaveURL("/read/john-1.1-5?v=john-1.1,3");
    await expect(page.getByRole("complementary", { name: "John 1:1, 3" })).toBeVisible();
    await expect(verse(page, 43001002)).not.toHaveAttribute("data-selected");

    // The default color, no note.
    await newHighlight(page).getByRole("button", { name: "Highlight" }).click();
    await expect(page).toHaveURL("/read/john-1.1-5");
    await expect(verse(page, 43001001)).toHaveCSS("background-color", YELLOW);
    await expect(verse(page, 43001003)).toHaveCSS("background-color", YELLOW);
    await expect(verse(page, 43001002)).not.toHaveAttribute("data-highlight");
    await expect(page.locator("[data-highlight-note]")).toHaveCount(0);

    // One highlight, not two.
    await page.goto("/highlights?book=john");
    await expect(card(page, "John 1:1, 3")).toHaveCount(1);
    await expect(card(page, "John 1:1, 3").locator("[data-highlight-quote]")).toContainText(
      "In the beginning was the Word",
    );
    await expect(card(page, "John 1:1, 3").locator("[data-highlight-quote]")).toContainText(" … ");

    // Selecting one of its verses brings it up in the panel, to change.
    await page.goto("/read/john-1.1-5");
    await clickVerse(page, 43001003);
    const mine = card(panel(page), "John 1:1, 3");
    await expect(mine).toBeVisible();
    await mine.getByText("Edit", { exact: true }).click();
    await color(mine, "Pink").click();
    await mine.getByRole("textbox", { name: "Note (optional)" }).fill("The Word");
    await mine.getByRole("button", { name: "Save" }).click();
    await expect(mine.getByRole("status")).toHaveText("Saved.");
    await expect(mine.locator("[data-highlight-note-text]")).toContainText("The Word");
    await expect(verse(page, 43001001)).toHaveCSS("background-color", PINK);
    await expect(page.getByRole("link", { name: "Note on John 1:1, 3: The Word" })).toBeVisible();
    // A note is one line of at most 280 characters; the field stops there.
    await expect(mine.getByRole("textbox", { name: "Note (optional)" })).toHaveAttribute("maxlength", "280");

    // And to delete.
    await mine.getByRole("button", { name: "Delete this highlight" }).click();
    await expect(card(panel(page), "John 1:1, 3")).toHaveCount(0);
    await expect(verse(page, 43001001)).not.toHaveAttribute("data-highlight");
    await expect(verse(page, 43001003)).not.toHaveAttribute("data-highlight");
    await page.goto("/highlights?book=john");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(card(page, "John 1:1, 3")).toHaveCount(0);
  });

  test("selects and highlights from the keyboard", async ({ page }) => {
    await page.goto("/read/psalm-23");
    await page.getByRole("link", { name: "Study Psalms 23:1" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1");
    await expect(panel(page)).toBeFocused();

    // "Select more verses" makes each verse number add or remove its verse.
    await panel(page).getByRole("link", { name: "Select more verses" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1&add=1");
    await expect(panel(page).locator("[data-adding-verses]")).toBeVisible();
    await page.getByRole("link", { name: "Add Psalms 23:3 to the selection" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1,3&add=1");
    // Focus stays on the verse, which now offers to take it away.
    await expect(page.getByRole("link", { name: "Remove Psalms 23:3 from the selection" })).toBeFocused();

    // Shift selects through to a verse.
    await page.getByRole("link", { name: "Add Psalms 23:5 to the selection" }).focus();
    await page.keyboard.press("Shift+Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1,3-5&add=1");
    await page.getByRole("link", { name: "Remove Psalms 23:4 from the selection" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1,3,5&add=1");
    await panel(page).getByRole("link", { name: "Done selecting" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1,3,5");

    // The colors are a radio group; Enter in the note submits.
    const form = newHighlight(page);
    await form.getByRole("radio", { name: "Yellow" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(form.getByRole("radio", { name: "Blue" })).toBeChecked();
    await form.getByRole("textbox", { name: "Note (optional)" }).focus();
    await page.keyboard.type("Shepherd");
    // Escape while typing is not "clear the selection".
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL("/read/psalm-23?v=psalm-23.1,3,5");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL("/read/psalm-23");
    for (const id of [19023001, 19023003, 19023005]) {
      await expect(verse(page, id)).toHaveAttribute("data-highlight", "blue");
    }
    for (const id of [19023002, 19023004, 19023006]) {
      await expect(verse(page, id)).not.toHaveAttribute("data-highlight");
    }
    // Every line of a verse of poetry is highlighted.
    const pieces = page.locator("[data-verse-id='19023001']");
    expect(await pieces.count()).toBeGreaterThan(1);
    expect(
      await pieces.evaluateAll((all) => all.every((piece) => piece.dataset.highlight === "blue")),
    ).toBe(true);
    // Focus is back in the text, on the first verse highlighted.
    await expect(page.getByRole("link", { name: "Study Psalms 23:1" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Note on Psalm 23:1, 3, 5: Shepherd" })).toBeVisible();
  });

  test("shows overlapping highlights, and one on a verse a translation leaves out", async ({
    page,
  }) => {
    // John 5:4 is in the KJV and not in the BSB.
    await page.goto("/read/john-5.3-5?t=kjv");
    await clickVerse(page, 43005004);
    await expect(page).toHaveURL("/read/john-5.3-5?t=kjv&v=john-5.4");
    await newHighlight(page).getByRole("textbox", { name: "Note (optional)" }).fill("The angel at the pool");
    await newHighlight(page).getByRole("button", { name: "Highlight" }).click();
    await expect(page).toHaveURL("/read/john-5.3-5?t=kjv");
    await expect(verse(page, 43005004)).toHaveCSS("background-color", YELLOW);

    // Side by side, the whole row is highlighted: the BSB's empty cell too.
    await page.goto("/read/john-5.3-5?t=bsb,kjv");
    await expect(row(page, 43005004)).toHaveAttribute("data-highlight", "yellow");
    await expect(row(page, 43005004).locator("td[data-translation='bsb'] [data-missing-verse]")).toHaveCSS(
      "background-color",
      YELLOW,
    );
    await expect(row(page, 43005004).getByRole("link", { name: /^Note on John 5:4/ })).toBeVisible();

    // In the BSB alone there is no verse to show it on: it is listed instead.
    await page.goto("/read/john-5.3-5");
    await expect(page.locator("[data-verse-id='43005004']")).toHaveCount(0);
    await expect(page.locator("[data-passage='bsb'] [data-highlight]")).toHaveCount(0);
    const hidden = page.getByRole("complementary", { name: "Highlights on verses not shown" });
    await expect(hidden).toContainText("A highlight is on verses that the BSB leaves out");
    await expect(hidden).toContainText("The angel at the pool");
    await hidden.getByRole("link", { name: "John 5:4" }).click();
    await expect(page).toHaveURL("/read/john-5.3-5?v=john-5.4");
    await expect(card(page.getByRole("complementary", { name: "John 5:4" }), "John 5:4")).toContainText(
      "The angel at the pool",
    );

    // A second highlight over the first: the newer color shows, with the
    // older one as a stripe beneath it.
    await page.goto("/read/john-5.3-5?t=kjv");
    // Clicked without waiting for the first click to show: the Shift-click
    // still starts from it.
    await clickVerse(page, 43005003);
    await clickVerse(page, 43005005, "Shift");
    await expect(page).toHaveURL("/read/john-5.3-5?t=kjv&v=john-5.3-5");
    await expect(card(panel(page), "John 5:4")).toBeVisible();
    await color(newHighlight(page), "Blue").click();
    await newHighlight(page).getByRole("button", { name: "Highlight" }).click();
    await expect(page).toHaveURL("/read/john-5.3-5?t=kjv");
    await expect(verse(page, 43005003)).toHaveAttribute("data-highlight", "blue");
    await expect(verse(page, 43005003)).not.toHaveAttribute("data-highlight-under");
    await expect(verse(page, 43005004)).toHaveAttribute("data-highlight", "blue");
    await expect(verse(page, 43005004)).toHaveAttribute("data-highlight-under", "yellow");
    await expect(verse(page, 43005004)).toHaveCSS("box-shadow", /inset/);
    // Both are in reach from the verse they share.
    await clickVerse(page, 43005004);
    await expect(panel(page).locator("[data-highlight-item]")).toHaveCount(2);

    // The list quotes each in the translation it was made in.
    await page.goto("/highlights?book=john&color=yellow");
    const quote = card(page, "John 5:4").locator("[data-highlight-quote]");
    await expect(quote).toContainText("For an angel went down at a certain season into the pool");
    await expect(quote).toContainText("KJV");
    await expect(page.locator("[data-attribution='kjv']")).toBeVisible();
  });

  test("changes and deletes a highlight from the list", async ({ page }) => {
    await page.goto("/read/psalm-1.1-2");
    await clickVerse(page, 19001001);
    await color(newHighlight(page), "Purple").click();
    await newHighlight(page).getByRole("textbox", { name: "Note (optional)" }).fill("Blessed");
    await newHighlight(page).getByRole("button", { name: "Highlight" }).click();
    await expect(verse(page, 19001001)).toHaveAttribute("data-highlight", "purple");

    await page.goto("/highlights?book=psalms&color=purple");
    const mine = card(page, "Psalm 1:1");
    await expect(mine).toContainText("Blessed");
    await mine.getByText("Edit", { exact: true }).click();
    await color(mine, "Green").click();
    await mine.getByRole("textbox", { name: "Note (optional)" }).fill("  Blessed is\tthe man  ");
    await mine.getByRole("button", { name: "Save" }).click();

    // It is no longer purple, so it leaves this list for the green one.
    await expect(mine).toHaveCount(0);
    await page.goto("/highlights?book=psalms&color=green");
    await expect(mine.locator("[data-highlight-note-text]")).toHaveText("Note: Blessed is the man");
    await page.goto("/read/psalm-1.1-2");
    await expect(verse(page, 19001001)).toHaveAttribute("data-highlight", "green");

    await page.goto("/highlights?book=psalms&color=green");
    await mine.getByText("Edit", { exact: true }).click();
    await mine.getByRole("button", { name: "Delete this highlight" }).click();
    await expect(mine).toHaveCount(0);
    await page.goto("/read/psalm-1.1-2");
    await expect(verse(page, 19001001)).not.toHaveAttribute("data-highlight");
  });

  test("pages through a long list of highlights", async ({ page }) => {
    // Twenty-three highlights on Psalm 119:1-23, the last one newest.
    const note = "Paging through Psalm 119";
    await seedHighlights(
      Array.from({ length: 23 }, (_, i) => 19119001 + i),
      { color: "pink", note },
    );
    const mine = page.locator("[data-highlight-item]").filter({ hasText: note });

    await page.goto("/highlights?color=pink&book=psalms");
    await expect(page.locator("[data-highlights-status]")).toHaveText("23 highlights. Showing 1–20.");
    await expect(mine).toHaveCount(20);
    // Newest first.
    await expect(mine.first().getByRole("heading")).toHaveText("Psalm 119:23");
    await expect(page.getByRole("link", { name: "Previous" })).toHaveCount(0);

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL("/highlights?color=pink&book=psalms&page=2");
    await expect(page.locator("[data-highlights-status]")).toHaveText("23 highlights. Showing 21–23.");
    await expect(mine).toHaveCount(3);
    await expect(mine.last().getByRole("heading")).toHaveText("Psalm 119:1");
    await expect(page.getByRole("navigation", { name: "Pages of highlights" })).toContainText("Page 2 of 2");
    await expect(page.getByRole("link", { name: "Next" })).toHaveCount(0);

    // A page past the end shows the last one.
    await page.goto("/highlights?color=pink&book=psalms&page=9");
    await expect(page).toHaveURL("/highlights?color=pink&book=psalms&page=2");
  });

  test("a request to write a highlight is refused without the owner's session", async ({
    page,
    baseURL,
  }) => {
    // Make a highlight, keeping the request the form sent.
    await page.goto("/read/romans-5.8");
    await clickVerse(page, 45005008);
    await newHighlight(page).getByRole("textbox", { name: "Note (optional)" }).fill("While we were still sinners");
    const created = page.waitForRequest(
      (sent) => sent.method() === "POST" && sent.headers()["next-action"] !== undefined,
    );
    await newHighlight(page).getByRole("button", { name: "Highlight" }).click();
    const create = await created;
    await expect(verse(page, 45005008)).toHaveAttribute("data-highlight", "yellow");

    // And change it, keeping that request too.
    await clickVerse(page, 45005008);
    const mine = card(panel(page), "Romans 5:8");
    await mine.getByText("Edit", { exact: true }).click();
    await mine.getByRole("textbox", { name: "Note (optional)" }).fill("Christ died for us");
    const updated = page.waitForRequest(
      (sent) => sent.method() === "POST" && sent.headers()["next-action"] !== undefined,
    );
    await mine.getByRole("button", { name: "Save" }).click();
    const update = await updated;
    await expect(mine.getByRole("status")).toHaveText("Saved.");

    // Send both again as a visitor: same address, same body, no cookies.
    const visitor = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    for (const sent of [create, update]) {
      const headers = { ...sent.headers() };
      delete headers.cookie;
      delete headers["content-length"];
      const body = sent.postDataBuffer()!.toString("latin1");
      const response = await visitor.post(sent.url(), {
        headers,
        data: Buffer.from(body.replace("Christ died for us", "Changed by a visitor"), "latin1"),
        maxRedirects: 0,
      });
      // The action answers with a redirect to the sign-in page.
      expect(response.headers()["x-action-redirect"] ?? response.headers().location).toContain("/sign-in");
    }
    await visitor.dispose();

    // Nothing was added and nothing changed.
    await page.goto("/read/romans-5.8?v=romans-5.8");
    await expect(panel(page).locator("[data-highlight-item]")).toHaveCount(1);
    await expect(card(panel(page), "Romans 5:8").locator("[data-highlight-note-text]")).toContainText(
      "Christ died for us",
    );

    // The same request with the owner's session does write, so it was the
    // missing session that stopped it.
    const headers = { ...create.headers() };
    delete headers.cookie;
    delete headers["content-length"];
    await page.request.post(create.url(), {
      headers,
      data: create.postDataBuffer()!,
      maxRedirects: 0,
    });
    await page.reload();
    await expect(panel(page).locator("[data-highlight-item]")).toHaveCount(2);
  });
});

test.describe("on a touch screen", () => {
  test.use({ storageState: OWNER_STATE, hasTouch: true, viewport: { width: 390, height: 780 } });

  async function tapVerse(page: Page, id: number) {
    // At the top, clear of the sheet the panel is on a narrow screen.
    const { x, y } = await wordsOf(page, id, "start");
    await page.touchscreen.tap(x, y);
  }

  test("selects verses by tapping, and highlights them", async ({ page }) => {
    await page.goto("/read/romans-12.1-3");
    await tapVerse(page, 45012001);
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1");

    await panel(page).getByRole("link", { name: "Select more verses" }).tap();
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1&add=1");
    await tapVerse(page, 45012003);
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1,3&add=1");
    // A verse between two selected ones joins them into a run.
    await tapVerse(page, 45012002);
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1-3&add=1");
    // And a tap on a selected verse takes it away.
    await tapVerse(page, 45012003);
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1-2&add=1");
    await panel(page).getByRole("link", { name: "Done selecting" }).tap();
    await expect(page).toHaveURL("/read/romans-12.1-3?v=romans-12.1-2");

    const form = newHighlight(page);
    await color(form, "Pink").tap();
    await form.getByRole("button", { name: "Highlight" }).tap();
    await expect(page).toHaveURL("/read/romans-12.1-3");
    await expect(verse(page, 45012001)).toHaveCSS("background-color", PINK);
    await expect(verse(page, 45012002)).toHaveCSS("background-color", PINK);
    await expect(verse(page, 45012003)).not.toHaveAttribute("data-highlight");
  });
});
