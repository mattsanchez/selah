import { expect, test, type Page } from "@playwright/test";

import { setItemMarkdown, storedItem } from "./db";
import { editor, editorId, publish, setTags, writeAtEnd } from "./editor";
import { OWNER_STATE } from "./owner";
import { clickVerse, panel, verse } from "./reader";

// Journey 7: share to the feed. From a highlight, "Share" publishes it as a
// feed item (passage card, color accent, note). From the reader, "Reflect"
// opens a reflection draft with the selected passage embedded; "Note" posts a
// quick item. The rich editor with autosave, tags, visibility (the editor's
// own journey is e2e/editor.spec.ts).
//
// Here the owner sees their items, as the feed shows them, in "My items";
// what a visitor sees of the public ones is journey 9 (e2e/public-site.spec.ts).
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
    const post = editor(page);

    // A draft, with the passage in it as a block, recorded.
    const vine = post.passage("John 15:4-5");
    await expect(vine).toContainText("I am the vine and you are the branches.");
    await expect(vine.locator("[data-card-translation='bsb']")).toHaveText("BSB");
    await expect(vine.locator("[data-attribution='bsb']")).toBeVisible();
    await expect(post.publishButton).toHaveAttribute("data-publish-state", "private");
    expect(await storedItem(reflectionId)).toMatchObject({
      kind: "reflection",
      markdown: "[[John 15:4-5 | BSB]]",
      visibility: "private",
      publishedAt: null,
      passages: ["43015004-43015005:bsb"],
    });

    // Write: it saves itself, and what is typed as HTML stays text.
    await post.title.fill("Abide");
    await writeAtEnd(post.body, "Apart from him, **nothing**. <script>window.pwned = true</script>");
    await expect(post.body.locator("strong")).toHaveText("nothing");
    await expect(post.status).toHaveText("Saved");
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);
    expect((await storedItem(reflectionId))!.markdown).toMatch(
      /^\[\[John 15:4-5 \| BSB\]\]\n\nApart from him, \*\*nothing\*\*\. \\?<script>/,
    );

    // Autosave survives a reload.
    await page.reload();
    await expect(post.title).toHaveValue("Abide");
    await expect(post.body.locator("strong")).toHaveText("nothing");
    await expect(post.body).toContainText("<script>window.pwned = true</script>");
    await expect(post.status).toHaveText("Saved");
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);

    // Even a reload before the save: nothing typed is lost.
    await writeAtEnd(post.body, " Typed a moment before the reload.");
    await page.reload();
    await expect(post.body).toContainText("Typed a moment before the reload.");
    await expect(post.status).toHaveText("Saved");
    expect((await storedItem(reflectionId))!.markdown).toMatch(/Typed a moment before the reload\.$/);

    // A second passage, in another translation, from the "/" menu: the
    // passages follow the document.
    await writeAtEnd(post.body, "\n/psalm 46:1 kjv");
    await page.getByRole("option", { name: /^Passage: Psalm 46:1/ }).click();
    const refuge = post.passage("Psalm 46:1");
    await expect(refuge).toContainText("God is our refuge and strength, a very present help in trouble.");
    await expect(refuge.locator("[data-card-translation='kjv']")).toHaveText("KJV");
    await expect(refuge.locator("[data-attribution='kjv']")).toBeVisible();
    await expect(post.status).toHaveText("Saved");
    expect((await storedItem(reflectionId))!.passages).toEqual([
      "19046001-19046001:kjv",
      "43015004-43015005:bsb",
    ]);
    expect((await storedItem(reflectionId))!.markdown).toMatch(/\n\n\[\[Psalm 46:1 \| KJV\]\]$/);

    // Tags.
    await setTags(page, "Abiding, #Fruit, abiding");
    await expect(post.status).toHaveText("Saved");
    expect((await storedItem(reflectionId))!.tags).toEqual(["abiding", "fruit"]);

    // Visibility, and publish.
    await publish(page, "Unlisted");
    await expect(post.publishButton).toHaveAttribute("data-publish-state", "unlisted");
    const published = await storedItem(reflectionId);
    expect(published).toMatchObject({ visibility: "unlisted" });
    expect(published!.publishedAt).toBeInstanceOf(Date);
    await publish(page, "Public");
    await expect(post.publishButton).toHaveAttribute("data-publish-state", "public");
    expect(await storedItem(reflectionId)).toMatchObject({
      visibility: "public",
      publishedAt: published!.publishedAt,
    });
    // The text is still what it was.
    expect((await storedItem(reflectionId))!.markdown).toMatch(/\[\[Psalm 46:1 \| KJV\]\]$/);

    // In the list, as the feed will show it, and under its tag.
    await page.getByRole("link", { name: "Back to My items" }).click();
    await expect(page).toHaveURL("/items");
    const reflection = feedItem(page, "reflection", "Abide");
    await expect(reflection.getByRole("heading", { name: "Abide" })).toBeVisible();
    await expect(reflection.locator(".item-prose strong")).toHaveText("nothing");
    await expect(reflection).toContainText("<script>window.pwned = true</script>");
    await expect(reflection.locator("script")).toHaveCount(0);
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

    // --- A note on a passage, in the editor's note form ---
    await page.goto("/read/psalm-46.10?t=kjv");
    await clickVerse(page, 19046010);
    await expect(page).toHaveURL("/read/psalm-46.10?t=kjv&v=psalm-46.10");
    await panel(page).getByRole("link", { name: "Note on Psalm 46:10" }).click();
    await expect(page).toHaveURL(/^[^?]+\/write\?kind=note&v=psalm-46\.10&tr=kjv&back=/);
    // No title; the verses it is on, above it.
    await expect(post.title).toHaveCount(0);
    await expect(page.locator("[data-note-anchor='Psalm 46:10']")).toContainText("Be still, and know that I am God");
    await post.note.pressSequentially("Stillness is *not* idleness.");
    await expect(post.note.locator("em")).toHaveText("not");
    await setTags(page, "rest");
    await expect(post.status).toHaveText("Saved");
    await publish(page, "Public", "Post");
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
      markdown: "Stillness is *not* idleness.",
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

    // --- A quick note on no passage, from "My items": a private draft ---
    await page.getByRole("region", { name: "Write" }).getByRole("link", { name: "Quick note" }).click();
    await expect(page).toHaveURL("/write?kind=note&back=/items");
    await post.note.pressSequentially("A thought with no verse to hang it on.");
    await expect(post.status).toHaveText("Saved");
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    await page.getByRole("link", { name: "Back to My items" }).click();
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
    await visitorPage.goto("/write");
    await expect(visitorPage).toHaveURL("/sign-in?next=%2Fwrite");
    await visitorPage.goto("/write?kind=note");
    await expect(visitorPage).toHaveURL("/sign-in?next=%2Fwrite%3Fkind%3Dnote");
    for (const id of [reflectionId, noteId, highlightId]) {
      await visitorPage.goto(`/items/${id}/edit`);
      await expect(visitorPage).toHaveURL(`/sign-in?next=%2Fitems%2F${id}%2Fedit`);
    }
    await visitorPage.goto("/read/psalm-46.10?t=kjv&v=psalm-46.10");
    const visitorPanel = visitorPage.getByRole("complementary", { name: "Psalm 46:10" });
    await expect(visitorPanel.locator("[data-study-section='cross-references']")).toBeVisible();
    await expect(visitorPanel.locator("[data-study-section='write']")).toHaveCount(0);
    await expect(visitorPage.getByRole("button", { name: /Reflect/ })).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: /^Note on/ })).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: "New post" })).toHaveCount(0);
    await expect(visitorPage.getByRole("link", { name: "My items" })).toHaveCount(0);
    expect(await visitorPage.content()).not.toContain("Stillness is");
    // Published or not, nothing of the owner's is in the reader a visitor
    // has. (The public site lists public items: journey 9.)
    for (const path of ["/read/romans-1.16-17", "/read/john-15.4-5"]) {
      await visitorPage.goto(path);
      const html = await visitorPage.content();
      expect(html).not.toContain("Not ashamed");
      expect(html).not.toContain("Apart from him");
      expect(html).not.toContain("data-feed-item");
    }
    await visitor.close();
  });

  test("edits a note, unpublishes it, and deletes a note and a reflection", async ({ page }) => {
    const post = editor(page);
    // A note, from the reader, on a verse of its own.
    await page.goto("/read/romans-15.13");
    await clickVerse(page, 45015013);
    await panel(page).getByRole("link", { name: "Note on Romans 15:13" }).click();
    // A note is not posted empty.
    await page.locator("[data-publish-state]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Post now" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Write the note first.");
    await page.keyboard.press("Escape");
    await expect(post.publishButton).toBeFocused();
    await post.note.pressSequentially("Hope overflows.");
    await publish(page, "Public", "Post");
    await expect(page).toHaveURL("/read/romans-15.13?v=romans-15.13");
    const written = panel(page).getByRole("list", { name: "Written on Romans 15:13" });
    await written.getByRole("link", { name: "Hope overflows." }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const noteId = editorId(page);

    // The editor of a note: its text and tags; it stays on its verse.
    await expect(post.title).toHaveCount(0);
    await expect(page.locator("[data-note-anchor='Romans 15:13']")).toContainText("Now may the God of hope fill you");
    await expect(post.note).toHaveText("Hope overflows.");
    await post.note.click();
    await post.note.press("ControlOrMeta+a");
    await post.note.pressSequentially("Hope overflows, by the Spirit.");
    await setTags(page, "hope");
    await expect(post.status).toHaveText("Saved");
    expect(await storedItem(noteId)).toMatchObject({
      markdown: "Hope overflows, by the Spirit.",
      passages: ["45015013-45015013:bsb"],
      tags: ["hope"],
      visibility: "public",
    });
    // Emptied, it is not saved, and says why.
    await post.note.press("ControlOrMeta+a");
    await post.note.press("Backspace");
    await expect(post.status).toHaveText("Not saved");
    await expect(page.locator("[data-item-editor]").getByRole("alert")).toHaveText("Write the note first.");
    await post.note.pressSequentially("Hope overflows, by the Spirit.");
    await expect(post.status).toHaveText("Saved");

    // Unpublish: private again, with no date.
    await post.publishButton.click();
    await page.getByRole("dialog").getByRole("button", { name: "Unpublish" }).click();
    await expect(post.publishButton).toHaveAttribute("data-publish-state", "private");
    await expect(post.publishButton).toHaveText("Post");
    expect(await storedItem(noteId)).toMatchObject({ visibility: "private", publishedAt: null });

    // Delete it: gone from the list, and so is its tag.
    await page.getByRole("button", { name: "Post settings" }).click();
    await page.getByRole("button", { name: "Delete this note" }).click();
    await expect(page).toHaveURL("/items");
    await expect(feedItem(page, "note", "Hope overflows")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Filter by tag" }).getByRole("link", { name: "#hope" })).toHaveCount(0);
    expect(await storedItem(noteId)).toBeUndefined();
    await page.goto(`/items/${noteId}/edit`);
    await expect(page.getByRole("heading", { name: /404|not found/i }).first()).toBeVisible();

    // A reflection begun on no passage, from "My items".
    await page.goto("/items");
    await page.getByRole("region", { name: "Write" }).getByRole("link", { name: "New post" }).click();
    await expect(page).toHaveURL("/write");
    await post.body.click();
    await post.body.pressSequentially("/romans 15:5-6");
    await page.keyboard.press("Enter");
    await expect(post.passage("Romans 15:5-6")).toContainText("Now may the God who gives endurance");
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    await expect(post.status).toHaveText("Saved");
    const reflectionId = editorId(page);
    expect((await storedItem(reflectionId))!.passages).toEqual(["45015005-45015006:bsb"]);

    // Written in the old text area with a card that cannot be read, it opens
    // with that card kept and saying why.
    await setItemMarkdown(reflectionId, "[[Romans 99:1]]\n\n[[Romans 15:5-6 | BSB]]\n");
    await page.reload();
    await expect(page.locator("[data-bad-passage]")).toContainText("[[Romans 99:1]]");
    await expect(post.passage("Romans 15:5-6")).toBeVisible();

    // It shows on its verses in the reader, as a draft.
    await page.goto("/read/romans-15.5-6?v=romans-15.6");
    await expect(panel(page).getByRole("list", { name: "Written on Romans 15:6" })).toContainText(
      "Untitled reflection Reflection · Private",
    );
    await page.goto(`/items/${reflectionId}/edit`);
    await page.getByRole("button", { name: "Post settings" }).click();
    await page.getByRole("button", { name: "Delete this reflection" }).click();
    await expect(page).toHaveURL("/items");
    expect(await storedItem(reflectionId)).toBeUndefined();
  });
});
