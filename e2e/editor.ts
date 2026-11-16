import { expect, type Locator, type Page } from "@playwright/test";

// The rich editor of reflections and notes (src/components/editor), for the
// journeys that write in it.

export const editor = (page: Page) => ({
  title: page.getByRole("textbox", { name: "Title" }),
  // A reflection's body; a note's is "Note".
  body: page.getByRole("textbox", { name: "Post body" }),
  note: page.getByRole("textbox", { name: "Note", exact: true }),
  status: page.locator("[data-save-status]"),
  sidebar: page.getByRole("complementary", { name: "Study sidebar" }),
  publishButton: page.locator("[data-publish-state]"),
  passage: (reference: string) => page.locator(`[data-passage-block='${reference}']`),
});

// The cursor at the end of the text. The editor is focused with a click in
// the space below the text, as a writer would, and the caret is then put at
// the end of the document by its selection: where that click lands depends on
// the editor's height at that moment, which moves while a post grows.
export async function writeAtEnd(body: Locator, text: string) {
  const box = (await body.boundingBox())!;
  await body.click({ position: { x: 4, y: box.height - 4 } });
  await body.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await body.pressSequentially(text);
}

// Publishes with the editor's "Publish" (or a note's "Post").
export async function publish(page: Page, visibility: "Public" | "Unlisted", verb = "Publish") {
  await page.locator("[data-publish-state]").click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("radio", { name: new RegExp(`^${visibility}`) }).check();
  await menu.getByRole("button", { name: new RegExp(`^(${verb} now|Update)$`) }).click();
}

// Opens the post's settings and sets its tags.
export async function setTags(page: Page, tags: string) {
  await page.getByRole("button", { name: "Post settings" }).click();
  await page.getByRole("dialog", { name: "Post settings" }).getByRole("textbox", { name: "Tags" }).fill(tags);
  await page.keyboard.press("Escape");
  // Focus goes back to the button that opened it.
  await expect(page.getByRole("button", { name: "Post settings" })).toBeFocused();
}

export const editorId = (page: Page) => new URL(page.url()).pathname.split("/")[2];
