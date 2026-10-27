import { expect, test } from "@playwright/test";

import { seedHighlights, storedItem } from "./db";
import { editor, editorId, publish, writeAtEnd } from "./editor";
import { OWNER_STATE } from "./owner";
import { clickVerse, panel } from "./reader";

// The rich editor with its study sidebar (issue #30): writing is the centre
// of Selah, and the Bible is there to support it. A post is written as rich
// text, passages go in as blocks from the sidebar or the "/" menu, and what
// is stored is the Markdown with its cards, as before.
//
// Passages of its own: John 14:27, 17:17, 11:35; Romans 6:23; Psalm 121:1-2.

test.describe("the signed-in owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("writes a post with passages from the sidebar, My content and the / menu", async ({ page }) => {
    await seedHighlights([45006023], { color: "green", note: "The free gift" });

    // "New post" is in the owner bar on every page, and the bar steps aside
    // in the editor.
    await page.goto("/read/john-14.27");
    await page.getByRole("navigation", { name: "Owner" }).getByRole("link", { name: "New post" }).click();
    await expect(page).toHaveURL("/write");
    await expect(page.getByRole("navigation", { name: "Owner" })).toBeHidden();
    const post = editor(page);
    await expect(post.status).toHaveText("New draft");

    // Title, then the body, formatted with Markdown shortcuts as it is typed.
    await expect(post.title).toBeFocused();
    await post.title.pressSequentially("Peace that guards");
    await post.title.press("Enter");
    await expect(post.body).toBeFocused();
    await post.body.pressSequentially("## Not as the world gives\nDo not let your hearts be troubled.\n> Peace I leave with you.\n");
    await post.body.press("Enter");
    await post.body.pressSequentially("- believe\nask\n");
    await post.body.press("Enter");
    await expect(post.body.locator("h2")).toHaveText("Not as the world gives");
    await expect(post.body.locator(":scope > blockquote")).toHaveText("Peace I leave with you.");
    await expect(post.body.locator("ul > li")).toHaveText(["believe", "ask"]);
    // No Markdown is shown while writing.
    await expect(post.body).not.toContainText("##");

    // The selection toolbar: "troubled" in bold.
    await post.body.getByText("Do not let your hearts be troubled.").evaluate((element) => {
      const text = element.firstChild!;
      const start = text.textContent!.indexOf("troubled");
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + "troubled".length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const toolbar = page.getByRole("toolbar", { name: "Format" });
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Bold" }).click();
    await expect(post.body.locator("strong")).toHaveText("troubled");

    // The first save made the post; the address is its editor's now.
    await expect(post.status).toHaveText("Saved");
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const id = editorId(page);

    // From the sidebar's "Read": look up a passage, select a verse, insert it.
    const sidebar = post.sidebar;
    await expect(sidebar).toBeVisible();
    await writeAtEnd(post.body, "From the Lord himself:");
    await sidebar.getByRole("textbox", { name: "Passage" }).fill("jn 14");
    await sidebar.getByRole("button", { name: "Read", exact: true }).click();
    await expect(sidebar.getByRole("region", { name: "Reading John 14" })).toContainText(
      "Peace I leave with you; My peace I give to you.",
    );
    await sidebar.locator("[data-verse-id='43014027']").first().click();
    await sidebar.getByRole("button", { name: "Insert John 14:27" }).click();
    const gift = post.passage("John 14:27");
    await expect(gift).toContainText("Peace I leave with you; My peace I give to you.");
    await expect(gift.locator("[data-attribution='bsb']")).toBeVisible();
    // Reading on: the next chapter.
    await sidebar.getByRole("button", { name: "John 15 →" }).click();
    await expect(sidebar.getByRole("region", { name: "Reading John 15" })).toBeVisible();

    // From "My content": a highlight goes in as its passage.
    await sidebar.getByRole("tab", { name: "My content" }).click();
    const highlight = sidebar.locator("[data-content-item][data-kind='highlight']").filter({ hasText: "Romans 6:23" })
      .first();
    await expect(highlight).toContainText("The free gift");
    await highlight.getByRole("button", { name: "Insert Romans 6:23" }).click();
    await expect(post.passage("Romans 6:23")).toContainText("the gift of God is eternal life");

    // From the "/" menu, by typing the reference (and a translation).
    await writeAtEnd(post.body, "/ps 121:1-2 kjv");
    const option = page.getByRole("option", { name: /^Passage: Psalm 121:1-2/ });
    await expect(option).toContainText("KJV");
    await page.keyboard.press("Enter");
    const hills = post.passage("Psalm 121:1-2");
    await expect(hills).toContainText("I will lift up mine eyes unto the hills");
    await expect(hills.locator("[data-card-translation='kjv']")).toHaveText("KJV");
    await expect(post.body.getByText("/ps 121")).toHaveCount(0);

    // A block is one unit: removed whole, and back with undo.
    await hills.hover();
    await hills.getByRole("button", { name: "Remove passage" }).click();
    await expect(hills).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(post.passage("Psalm 121:1-2")).toBeVisible();
    // Its translation changes in place.
    await post.passage("John 14:27").hover();
    await post.passage("John 14:27").getByRole("combobox", { name: "Translation" }).selectOption("web");
    await expect(post.passage("John 14:27")).toContainText("Peace I leave with you. My peace I give to you");
    await expect(post.status).toHaveText("Saved");

    // Everything survives a reload.
    await page.reload();
    await expect(post.title).toHaveValue("Peace that guards");
    await expect(post.body.locator("strong")).toHaveText("troubled");
    await expect(post.body.locator(":scope > blockquote")).toHaveText("Peace I leave with you.");
    for (const reference of ["John 14:27", "Romans 6:23", "Psalm 121:1-2"]) {
      await expect(post.passage(reference)).toBeVisible();
    }
    await expect(post.status).toHaveText("Saved");

    // Publish.
    await publish(page, "Public");
    await expect(post.publishButton).toHaveAttribute("data-publish-state", "public");

    // Stored as Markdown with cards, and every passage indexed.
    const stored = (await storedItem(id))!;
    expect(stored).toMatchObject({ kind: "reflection", title: "Peace that guards", visibility: "public" });
    expect(stored.publishedAt).toBeInstanceOf(Date);
    expect(stored.markdown).toBe(
      [
        "## Not as the world gives",
        "Do not let your hearts be **troubled**.",
        "> Peace I leave with you.",
        "- believe\n- ask",
        "From the Lord himself:",
        "[[John 14:27 | WEB]]",
        "[[Romans 6:23 | BSB]]",
        "[[Psalm 121:1-2 | KJV]]",
      ].join("\n\n"),
    );
    expect(stored.passages).toEqual(["19121001-19121002:kjv", "43014027-43014027:web", "45006023-45006023:bsb"]);
  });

  test("Reflect in the reader opens the editor with the passage in it", async ({ page }) => {
    await page.goto("/read/john-17.17");
    await clickVerse(page, 43017017);
    await panel(page).getByRole("button", { name: "Reflect on John 17:17" }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\/edit$/);
    const post = editor(page);
    await expect(post.passage("John 17:17")).toContainText("Your word is truth.");
    // The sidebar reads it too.
    await expect(post.sidebar.getByRole("region", { name: "Reading John 17:17" })).toBeVisible();
    await writeAtEnd(post.body, "Sanctified by the truth.");
    await expect(post.status).toHaveText("Saved");
    expect((await storedItem(editorId(page)))!.markdown).toBe("[[John 17:17 | BSB]]\n\nSanctified by the truth.");
  });

  test("writes a note in the note form: no title, no passages in its text", async ({ page }) => {
    await page.goto("/read/john-11.35");
    await page.getByRole("navigation", { name: "Owner" }).getByRole("link", { name: "New note" }).click();
    await expect(page).toHaveURL("/write?kind=note");
    const post = editor(page);
    await expect(post.title).toHaveCount(0);
    await expect(post.note).toBeFocused();
    await post.note.pressSequentially("Short and **plain**.");
    await expect(post.status).toHaveText("Saved");
    const id = editorId(page);
    expect(await storedItem(id)).toMatchObject({
      kind: "note",
      markdown: "Short and **plain**.",
      visibility: "private",
      passages: [],
    });
    // The sidebar reads, but puts no passage in a note.
    await page.getByRole("button", { name: "Study" }).click();
    await post.sidebar.getByRole("textbox", { name: "Passage" }).fill("John 11:35");
    await post.sidebar.getByRole("button", { name: "Read", exact: true }).click();
    await expect(post.sidebar).toContainText("Jesus wept.");
    await expect(post.sidebar.getByRole("button", { name: /^Insert/ })).toHaveCount(0);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("writes with the sidebar as a sheet", async ({ page }) => {
      await page.goto("/write");
      const post = editor(page);
      await post.title.fill("Wept");
      await expect(post.sidebar).toBeHidden();
      // Nothing is wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

      await page.getByRole("button", { name: "Study" }).click();
      await expect(post.sidebar).toBeVisible();
      await post.sidebar.getByRole("textbox", { name: "Passage" }).fill("John 11:35");
      await post.sidebar.getByRole("button", { name: "Read", exact: true }).click();
      await post.sidebar.getByRole("button", { name: "Insert John 11:35" }).click();
      // The sheet closes on the post, with the passage in it.
      await expect(post.sidebar).toBeHidden();
      await expect(post.passage("John 11:35")).toContainText("Jesus wept.");
      await writeAtEnd(post.body, "The shortest verse.");
      await expect(post.status).toHaveText("Saved");
      expect((await storedItem(editorId(page)))!.markdown).toBe("[[John 11:35 | BSB]]\n\nThe shortest verse.");

      // Opened again, the post starts right under its title.
      await page.reload();
      await expect(post.passage("John 11:35")).toBeVisible();
      const title = (await post.title.boundingBox())!;
      expect(title.height).toBeLessThan(120);
      expect((await post.passage("John 11:35").boundingBox())!.y).toBeLessThan(title.y + title.height + 100);
    });
  });
});

test("a visitor who is not signed in cannot reach the editor", async ({ page }) => {
  await page.goto("/write");
  await expect(page).toHaveURL("/sign-in?next=%2Fwrite");
  await expect(page.locator("[data-editor-page]")).toHaveCount(0);
  const response = await page.request.get("/api/editor/passage?ref=John+3:16");
  expect(response.status()).toBe(401);
  expect((await page.request.get("/api/editor/items")).status()).toBe(401);
});
