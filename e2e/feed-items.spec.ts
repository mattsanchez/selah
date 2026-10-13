import { expect, test, type Locator, type Page } from "@playwright/test";

import { storedItem } from "./db";
import { OWNER_STATE } from "./owner";
import { clickVerse, panel, verse } from "./reader";

// Journey 7: share to the feed. From a highlight, "Share" publishes it as a
// feed item (passage card, color accent, note). From the reader, "Reflect"
// opens a reflection draft with the selected passage embedded; "Note" posts a
// quick item. Markdown editor with autosave, tags, visibility.
//
// The public feed is a later journey; here the owner sees their items, as
// the feed will show them, in "My items", and nobody else sees anything.
//
// Like the other specs on the fixture server, each test works on passages of
// its own and finds its own items.

const BLUE = "rgb(207, 227, 254)";
const BLUE_ACCENT = "rgb(59, 130, 246)";

// An item of the feed, by something it says.
const feedItem = (page: Page, kind: string, text: string) =>
  page.locator(`[data-feed-item][data-kind='${kind}']`).filter({ hasText: text });
const highlightCard = (page: Page, reference: string) =>
  page
    .locator("[data-highlight-item]")
    .filter({ has: page.getByRole("heading", { name: reference, exact: true }) });
const saveStatus = (page: Page) => page.locator("[data-save-status]");
const editorId = (page: Page) => new URL(page.url()).pathname.split("/")[2];
const noteForm = (scope: Page | Locator) => ({
  note: scope.getByRole("textbox", { name: "Note", exact: true }),
  tags: scope.getByRole("textbox", { name: "Tags (optional)" }),
  visibility: scope.getByRole("combobox", { name: "Visibility" }),
  post: scope.getByRole("button", { name: "Post note" }),
});

test.describe("the signed-in owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("journey 7: shares a highlight, reflects on a passage and posts notes", async ({
    page,
    browser,
  }) => {
    // --- Share a highlight ---
    await page.goto("/read/romans-1.16-17");
    await clickVerse(page, 45001016);
    await clickVerse(page, 45001017, "Shift");
    await expect(page).toHaveURL("/read/romans-1.16-17?v=romans-1.16-17");
    const newHighlight = panel(page).getByRole("group", { name: /^Highlight / });
    await newHighlight.locator("label.highlight-choice").filter({ hasText: "Blue" }).click();
    await newHighlight.getByRole("textbox", { name: "Note (optional)" }).fill("Not ashamed");
    await newHighlight.getByRole("button", { name: "Highlight" }).click();
    await expect(verse(page, 45001016)).toHaveAttribute("data-highlight", "blue");

    // It is private until it is shared, from its card beside "Edit".
    await page.goto("/highlights?book=romans&color=blue");
    const mine = highlightCard(page, "Romans 1:16-17");
    await expect(mine.locator("[data-visibility]")).toHaveText("Private");
    await expect(mine.getByText("Edit", { exact: true })).toBeVisible();
    await mine.getByRole("button", { name: "Share", exact: true }).click();
    await expect(mine.locator("[data-visibility]")).toHaveText("Public");
    await expect(mine.getByRole("button", { name: "Unshare" })).toBeVisible();
    const highlightId = (await mine.getAttribute("data-highlight-item"))!;
    const sharedAt = (await storedItem(highlightId))!.publishedAt;
    expect(sharedAt).toBeInstanceOf(Date);

    // The feed item: passage card, color accent, note.
    await page.getByRole("navigation", { name: "Owner" }).getByRole("link", { name: "My items" }).click();
    await expect(page).toHaveURL("/items");
    await expect(page.getByRole("heading", { level: 1, name: "My items" })).toBeVisible();
    const shared = feedItem(page, "highlight", "Not ashamed");
    await expect(shared).toHaveAttribute("data-highlight", "blue");
    await expect(shared).toHaveCSS("border-left-color", BLUE_ACCENT);
    const sharedCard = shared.locator("[data-passage-card='Romans 1:16-17']");
    await expect(sharedCard).toContainText("I am not ashamed of the gospel");
    await expect(sharedCard).toContainText("The righteous will live by faith.");
    await expect(sharedCard.locator(".highlight-text")).toHaveCSS("background-color", BLUE);
    await expect(sharedCard.locator("[data-card-translation='bsb']")).toHaveText("BSB");
    await expect(sharedCard.getByRole("link", { name: "Romans 1:16-17" })).toHaveAttribute(
      "href",
      "/read/romans-1.16-17",
    );
    await expect(shared.locator("[data-feed-note]")).toHaveText("Not ashamed");
    await expect(shared.locator("[data-visibility]")).toHaveText("Public");
    await expect(shared.locator("[data-attribution='bsb']")).toBeVisible();

    // Unlisted, unshared and shared again: the date goes with it being shared.
    await shared.getByRole("button", { name: "Make unlisted" }).click();
    await expect(shared.locator("[data-visibility]")).toHaveText("Unlisted");
    expect((await storedItem(highlightId))!.publishedAt).toEqual(sharedAt);
    await shared.getByRole("button", { name: "Unshare" }).click();
    await expect(shared.locator("[data-visibility]")).toHaveText("Private");
    expect(await storedItem(highlightId)).toMatchObject({ visibility: "private", publishedAt: null });
    await shared.getByRole("button", { name: "Share", exact: true }).click();
    await expect(shared.locator("[data-visibility]")).toHaveText("Public");
    expect(await storedItem(highlightId)).toMatchObject({
      visibility: "public",
      passages: ["45001016-45001017:bsb"],
    });

    // --- Reflect on a selected passage ---
    await page.goto("/read/john-15.4-5");
    await clickVerse(page, 43015004);
    await clickVerse(page, 43015005, "Shift");
    await expect(page).toHaveURL("/read/john-15.4-5?v=john-15.4-5");
    await panel(page).getByRole("button", { name: "Reflect on John 15:4-5" }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const reflectionId = editorId(page);

    // A draft, with the passage embedded as a card and recorded.
    const body = page.getByRole("textbox", { name: "Reflection" });
    await expect(body).toHaveValue("[[John 15:4-5 | BSB]]\n\n");
    await expect(page.locator("[data-publish-state='private']")).toContainText("A draft");
    const preview = page.locator("[data-feed-item]");
    const vine = preview.locator("[data-passage-card='John 15:4-5']");
    await expect(vine).toContainText("I am the vine and you are the branches.");
    await expect(vine.locator("[data-card-translation='bsb']")).toBeVisible();
    await expect(preview.locator("[data-attribution='bsb']")).toBeVisible();
    expect(await storedItem(reflectionId)).toMatchObject({
      kind: "reflection",
      visibility: "private",
      publishedAt: null,
      passages: ["43015004-43015005:bsb"],
    });

    // Write: it saves itself, and what is typed as HTML stays text.
    await page.getByRole("textbox", { name: "Title (optional)" }).fill("Abide");
    await body.fill(
      "[[John 15:4-5 | BSB]]\n\nApart from him, **nothing**.\n\n<script>window.pwned = true</script>\n\n<img src=x onerror=\"window.pwned = true\">",
    );
    await expect(saveStatus(page)).toHaveText("Saved");
    await expect(preview.locator("[data-feed-title]")).toHaveText("Abide");
    await expect(preview.locator(".item-prose strong")).toHaveText("nothing");
    await expect(preview).toContainText("<script>window.pwned = true</script>");
    await expect(preview.locator("script, img")).toHaveCount(0);
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);

    // Autosave survives a reload.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Title (optional)" })).toHaveValue("Abide");
    await expect(body).toHaveValue(/Apart from him, \*\*nothing\*\*\./);
    await expect(saveStatus(page)).toHaveText("Saved");
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);

    // Even a reload before the save: nothing typed is lost.
    await body.fill("[[John 15:4-5 | BSB]]\n\nApart from him, **nothing**.\n\nTyped a moment before the reload.");
    await page.reload();
    await expect(body).toHaveValue(/Typed a moment before the reload\.$/);
    await expect(saveStatus(page)).toHaveText("Saved");
    await expect(preview).toContainText("Typed a moment before the reload.");
    expect((await storedItem(reflectionId))!.markdown).toMatch(/Typed a moment before the reload\.$/);

    // A second card, in another translation: the passages follow the document.
    await body.press("ControlOrMeta+End");
    await body.pressSequentially("\n\n[[Psalm 46:1 | KJV]]");
    await expect(saveStatus(page)).toHaveText("Saved");
    const refuge = preview.locator("[data-passage-card='Psalm 46:1']");
    await expect(refuge).toContainText("God is our refuge and strength, a very present help in trouble.");
    await expect(refuge.locator("[data-card-translation='kjv']")).toHaveText("KJV");
    await expect(preview.locator("[data-attribution='kjv']")).toBeVisible();
    await expect(preview.locator("[data-attribution='bsb']")).toBeVisible();
    expect((await storedItem(reflectionId))!.passages).toEqual([
      "19046001-19046001:kjv",
      "43015004-43015005:bsb",
    ]);

    // Tags.
    await page.getByRole("textbox", { name: "Tags" }).fill("Abiding, #Fruit, abiding");
    await expect(saveStatus(page)).toHaveText("Saved");
    await expect(preview.getByRole("list", { name: "Tags" }).getByRole("listitem")).toHaveText([
      "#Abiding",
      "#Fruit",
    ]);
    expect((await storedItem(reflectionId))!.tags).toEqual(["abiding", "fruit"]);

    // Visibility, and publish.
    const publishing = page.getByRole("region", { name: "Publishing" });
    await publishing.getByRole("combobox", { name: "Visibility" }).selectOption("unlisted");
    await publishing.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("[data-publish-state='unlisted']")).toContainText("Unlisted. Published");
    const published = await storedItem(reflectionId);
    expect(published).toMatchObject({ visibility: "unlisted" });
    expect(published!.publishedAt).toBeInstanceOf(Date);
    await publishing.getByRole("combobox", { name: "Visibility" }).selectOption("public");
    await publishing.getByRole("button", { name: "Update visibility" }).click();
    await expect(page.locator("[data-publish-state='public']")).toContainText("Public. Published");
    expect(await storedItem(reflectionId)).toMatchObject({
      visibility: "public",
      publishedAt: published!.publishedAt,
    });
    // The text is still what it was.
    await expect(body).toHaveValue(/\[\[Psalm 46:1 \| KJV\]\]$/);

    // In the list, as the feed will show it, and under its tag.
    await page.getByRole("link", { name: "My items" }).first().click();
    await expect(page).toHaveURL("/items");
    const reflection = feedItem(page, "reflection", "Abide");
    await expect(reflection.getByRole("heading", { name: "Abide" })).toBeVisible();
    await expect(reflection.locator("[data-passage-card]")).toHaveCount(2);
    await expect(reflection.locator("[data-visibility]")).toHaveText("Public");
    await reflection.getByRole("link", { name: "#Abiding" }).click();
    await expect(page).toHaveURL("/items?tag=abiding");
    await expect(reflection).toHaveCount(1);
    await expect(shared).toHaveCount(0);
    await expect(reflection.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/items/${reflectionId}/edit`,
    );

    // --- A note on a passage ---
    await page.goto("/read/psalm-46.10?t=kjv");
    await clickVerse(page, 19046010);
    await expect(page).toHaveURL("/read/psalm-46.10?t=kjv&v=psalm-46.10");
    await panel(page).locator("[data-note-form] summary").click();
    const anchored = noteForm(panel(page).getByRole("group", { name: "Note on Psalm 46:10" }));
    await anchored.note.fill("Stillness is *not* idleness.");
    await anchored.tags.fill("rest");
    await expect(anchored.visibility).toHaveValue("public");
    await anchored.post.click();
    // Back on the verse, with the note among what is written on it.
    await expect(page).toHaveURL("/read/psalm-46.10?t=kjv&v=psalm-46.10");
    const written = panel(page).getByRole("list", { name: "Written on Psalm 46:10" });
    await expect(written.getByRole("listitem")).toHaveCount(1);
    await expect(written).toContainText("Stillness is not idleness.");
    await expect(written).toContainText("Note · Public");
    const noteId = (await written.locator("[data-written-item]").getAttribute("data-written-item"))!;
    const anchoredNote = await storedItem(noteId);
    expect(anchoredNote).toMatchObject({
      kind: "note",
      visibility: "public",
      passages: ["19046010-19046010:kjv"],
      tags: ["rest"],
    });
    expect(anchoredNote!.publishedAt).toBeInstanceOf(Date);

    await page.goto("/items?kind=note");
    const still = feedItem(page, "note", "Stillness is not idleness.");
    await expect(still.locator("[data-passage-card='Psalm 46:10']")).toContainText(
      "Be still, and know that I am God",
    );
    await expect(still.locator("[data-card-translation='kjv']")).toHaveText("KJV");
    await expect(still.locator("[data-attribution='kjv']")).toBeVisible();
    await expect(still.locator(".item-prose em")).toHaveText("not");
    await expect(still.getByRole("link", { name: "#rest" })).toBeVisible();
    await expect(still.locator("[data-visibility]")).toHaveText("Public");

    // --- A note on no passage, from "My items" ---
    const quick = noteForm(page.getByRole("region", { name: "Quick note" }));
    await quick.note.fill("A thought with no verse to hang it on.");
    await quick.visibility.selectOption("private");
    await quick.post.click();
    await expect(page).toHaveURL("/items");
    const thought = feedItem(page, "note", "A thought with no verse to hang it on.");
    await expect(thought).toHaveCount(1);
    await expect(thought.locator("[data-passage-card]")).toHaveCount(0);
    await expect(thought.locator("[data-visibility]")).toHaveText("Draft · Private");
    const thoughtId = (await thought.getAttribute("data-feed-item"))!;
    expect(await storedItem(thoughtId)).toMatchObject({
      kind: "note",
      visibility: "private",
      publishedAt: null,
      passages: [],
    });
    // All three kinds in one list.
    await expect(shared).toHaveCount(1);
    await expect(feedItem(page, "reflection", "Abide")).toHaveCount(1);
    await expect(still).toHaveCount(1);

    // --- A visitor who is not signed in reaches none of it ---
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto("/items");
    await expect(visitorPage).toHaveURL("/sign-in?next=%2Fitems");
    await visitorPage.goto("/items?kind=note&tag=rest");
    await expect(visitorPage).toHaveURL("/sign-in?next=%2Fitems%3Fkind%3Dnote%26tag%3Drest");
    for (const id of [reflectionId, noteId, highlightId]) {
      await visitorPage.goto(`/items/${id}/edit`);
      await expect(visitorPage).toHaveURL(`/sign-in?next=%2Fitems%2F${id}%2Fedit`);
    }
    await visitorPage.goto("/read/psalm-46.10?t=kjv&v=psalm-46.10");
    const visitorPanel = visitorPage.getByRole("complementary", { name: "Psalm 46:10" });
    await expect(visitorPanel.locator("[data-study-section='cross-references']")).toBeVisible();
    await expect(visitorPanel.locator("[data-study-section='write']")).toHaveCount(0);
    await expect(visitorPage.getByRole("button", { name: /Reflect/ })).toHaveCount(0);
    await expect(visitorPage.getByRole("button", { name: "Post note" })).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: "My items" })).toHaveCount(0);
    expect(await visitorPage.content()).not.toContain("Stillness is");
    // Published or not, nothing of the owner's is on the pages a visitor has.
    for (const path of ["/", "/read/romans-1.16-17", "/read/john-15.4-5"]) {
      await visitorPage.goto(path);
      const html = await visitorPage.content();
      expect(html).not.toContain("Not ashamed");
      expect(html).not.toContain("Apart from him");
      expect(html).not.toContain("data-feed-item");
    }
    await visitor.close();
  });

  test("edits a note, unpublishes a reflection and deletes them", async ({ page }) => {
    // A note, from the reader, on a verse of its own.
    await page.goto("/read/romans-15.13");
    await clickVerse(page, 45015013);
    await panel(page).locator("[data-note-form] summary").click();
    const form = noteForm(panel(page).getByRole("group", { name: "Note on Romans 15:13" }));
    // A note is not posted empty.
    await form.note.fill("   ");
    await form.post.click();
    await expect(panel(page).getByRole("alert")).toHaveText("Write the note first.");
    await form.note.fill("Hope overflows.");
    await form.post.click();
    const written = panel(page).getByRole("list", { name: "Written on Romans 15:13" });
    await written.getByRole("link", { name: "Hope overflows." }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const noteId = editorId(page);

    // The editor of a note: its text and tags; it stays on its verse.
    await expect(page.getByRole("heading", { level: 1, name: "Note" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Title (optional)" })).toHaveCount(0);
    const body = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(body).toHaveValue("Hope overflows.");
    await body.fill("Hope overflows, by the Spirit.");
    await page.getByRole("textbox", { name: "Tags" }).fill("hope");
    await expect(saveStatus(page)).toHaveText("Saved");
    const preview = page.locator("[data-feed-item]");
    await expect(preview.locator("[data-passage-card='Romans 15:13']")).toContainText(
      "Now may the God of hope fill you",
    );
    await expect(preview).toContainText("Hope overflows, by the Spirit.");
    expect(await storedItem(noteId)).toMatchObject({
      markdown: "Hope overflows, by the Spirit.",
      passages: ["45015013-45015013:bsb"],
      tags: ["hope"],
      visibility: "public",
    });
    // Emptied, it is not saved, and says why.
    await body.fill("");
    await expect(saveStatus(page)).toHaveText("Not saved");
    await expect(page.locator("[data-item-editor]").getByRole("alert")).toHaveText(
      "Write the note first.",
    );
    await body.fill("Hope overflows, by the Spirit.");
    await expect(saveStatus(page)).toHaveText("Saved");

    // Unpublish: private again, with no date.
    const publishing = page.getByRole("region", { name: "Publishing" });
    await publishing.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.locator("[data-publish-state='private']")).toContainText("A draft");
    await expect(publishing.getByRole("button", { name: "Publish" })).toBeVisible();
    expect(await storedItem(noteId)).toMatchObject({ visibility: "private", publishedAt: null });

    // Delete it: gone from the list, and so is its tag.
    await page.getByText("Delete", { exact: true }).click();
    await page.getByRole("button", { name: "Delete this note" }).click();
    await expect(page).toHaveURL("/items");
    await expect(feedItem(page, "note", "Hope overflows")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Filter by tag" }).getByRole("link", { name: "#hope" })).toHaveCount(0);
    expect(await storedItem(noteId)).toBeUndefined();
    await page.goto(`/items/${noteId}/edit`);
    await expect(page.getByRole("heading", { name: /404|not found/i }).first()).toBeVisible();

    // A reflection begun on no passage, with a card that cannot be read.
    await page.goto("/items");
    await page.getByRole("button", { name: "start a reflection" }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const reflectionId = editorId(page);
    await page.getByRole("textbox", { name: "Reflection" }).fill("[[Romans 99:1]]\n\n[[Romans 15:5-6]]");
    await expect(saveStatus(page)).toHaveText("Saved");
    await expect(preview.locator("[data-bad-card]")).toContainText("[[Romans 99:1]]");
    await expect(preview.locator("[data-passage-card='Romans 15:5-6']")).toBeVisible();
    expect((await storedItem(reflectionId))!.passages).toEqual(["45015005-45015006:"]);
    // It shows on its verses in the reader, as a draft.
    await page.goto("/read/romans-15.5-6?v=romans-15.6");
    await expect(panel(page).getByRole("list", { name: "Written on Romans 15:6" })).toContainText(
      "Untitled reflection Reflection · Private",
    );
    await page.goto(`/items/${reflectionId}/edit`);
    await page.getByText("Delete", { exact: true }).click();
    await page.getByRole("button", { name: "Delete this reflection" }).click();
    await expect(page).toHaveURL("/items");
    expect(await storedItem(reflectionId)).toBeUndefined();
  });
});
