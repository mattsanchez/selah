import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import { parseExport } from "../src/lib/export/format";
import { createOwnerItem, deleteItemsTagged, storedItem } from "./db";
import { editor, editorId, writeAtEnd } from "./editor";
import { OWNER_STATE, TEST_OWNER } from "./owner";
import { clickVerse, panel } from "./reader";

// Journey 10: find my own past items, by text, tag and passage (an overlapping
// one counts), from /items and from the editor; related passages in the reader
// and the editor; and everything exported.
//
// Passages of its own: Psalm 61:1-4, Psalm 62:1-2, Psalm 63:1, Romans 13:8-10,
// John 13:34-35. Its tags are m10-*.

const STILLNESS = "A quiet morning spent on stillness and waiting";

test.describe("the signed-in owner", () => {
  // One set of items, seeded once: these tests count what they find.
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: OWNER_STATE });

  let highlightId: string;
  let noteId: string;
  let reflectionId: string;

  test.beforeAll(async () => {
    await deleteItemsTagged("m10-");
    highlightId = await createOwnerItem({
      kind: "highlight",
      color: "green",
      note: "Rock higher than I",
      passages: [{ start: 19061001, end: 19061002 }],
      translationId: "bsb",
      tags: [{ slug: "m10-refuge", name: "m10-refuge" }],
    });
    noteId = await createOwnerItem(
      {
        kind: "note",
        markdown: "The commandments summed up in one line.",
        passages: [{ start: 45013008, end: 45013010 }],
        translationId: "web",
        tags: [{ slug: "m10-love", name: "m10-love" }],
      },
      "public",
    );
    reflectionId = await createOwnerItem(
      {
        kind: "reflection",
        title: "Waiting in silence",
        markdown: `${STILLNESS}.\n\n[[Psalm 62:1-2 | BSB]]\n\nThe soul waits **quietly**.`,
        passages: [{ start: 19062001, end: 19062002, translationId: "bsb" }],
        tags: [
          { slug: "m10-refuge", name: "m10-refuge" },
          { slug: "m10-silence", name: "m10-silence" },
        ],
      },
      "unlisted",
    );
  });

  const search = (page: Page) => page.getByRole("search", { name: "Search my items" });
  const shown = (page: Page) => page.getByRole("list", { name: "Items" }).locator(":scope > li");
  const status = (page: Page) => page.locator("[data-items-status]");

  test("searches /items by text, tag, passage, kind, color and visibility", async ({ page }) => {
    await page.goto("/items");

    // By words: in a title, a note, the Markdown.
    await search(page).getByRole("searchbox", { name: "Words" }).fill("silence waiting");
    await search(page).getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/items\?q=silence%20waiting|\/items\?q=silence\+waiting/);
    await expect(shown(page).first()).toContainText("Waiting in silence");
    await page.goto("/items?q=commandments&exact=1");
    await expect(shown(page)).toHaveCount(1);
    await expect(shown(page).first()).toContainText("summed up in one line");
    await page.goto(`/items?q=${encodeURIComponent("higher than")}`);
    await expect(shown(page).first()).toContainText("Rock higher than I");
    // As it is being typed: the start of a word finds it.
    await page.goto("/items?q=commandm&exact=1");
    await expect(shown(page)).toHaveCount(1);

    // By tag.
    await page.goto("/items?tag=m10-refuge");
    await expect(shown(page)).toHaveCount(2);

    // By passage: not the same range, only overlapping ones count.
    await page.goto("/items");
    await search(page).getByRole("textbox", { name: "On passage" }).fill("Psalm 61:2-4");
    await search(page).getByRole("button", { name: "Search" }).click();
    await expect(shown(page)).toHaveCount(1);
    await expect(shown(page).first()).toContainText("Rock higher than I");
    await page.goto(`/items?passage=${encodeURIComponent("Romans 13:10-14")}`);
    await expect(shown(page)).toHaveCount(1);
    await expect(shown(page).first()).toContainText("summed up in one line");
    // Next to it is not on it.
    await page.goto(`/items?passage=${encodeURIComponent("Psalm 61:3-4")}`);
    await expect(status(page)).toContainText("No items match.");
    // A passage that cannot be read says so.
    await page.goto(`/items?passage=${encodeURIComponent("John 99")}`);
    await expect(search(page).getByRole("alert")).toContainText("John has 21 chapters");

    // By kind, color and visibility, and all at once.
    await page.goto("/items?tag=m10-refuge&kind=highlight");
    await expect(shown(page)).toHaveCount(1);
    await page.goto("/items?tag=m10-refuge&color=green");
    await expect(shown(page)).toHaveCount(1);
    await page.goto("/items?tag=m10-refuge&visibility=unlisted");
    await expect(shown(page)).toHaveCount(1);
    await expect(shown(page).first()).toContainText("Waiting in silence");
    await page.goto(`/items?q=waits&exact=1&tag=m10-silence&passage=${encodeURIComponent("Psalm 62")}&kind=reflection`);
    await expect(shown(page)).toHaveCount(1);

    // The form keeps what it was asked, and kind links keep the search.
    await expect(search(page).getByRole("searchbox", { name: "Words" })).toHaveValue("waits");
    await page.getByRole("navigation", { name: "Filter by kind" }).getByRole("link", { name: "Everything" }).click();
    await expect(page).toHaveURL(/\?q=waits&passage=Psalm%2062&tag=m10-silence&exact=1$/);

    // A result opens: the post in its editor.
    await shown(page).first().getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(`/items/${reflectionId}/edit`);
  });

  test("finds a post by meaning, shortly after it is saved", async ({ page }) => {
    // Written in the editor, so it is embedded the way every post is.
    await page.goto("/write");
    const post = editor(page);
    await post.title.fill("Harbour for the restless");
    await post.body.click();
    await post.body.pressSequentially("Mercy keeps a lantern lit beside the harbour.");
    await expect(post.status).toHaveText("Saved");
    const id = editorId(page);

    // No text has both words, so only a vector can find it...
    const address = "/items?q=lantern+tempest";
    await expect(async () => {
      await page.goto(address);
      await expect(shown(page).getByRole("link", { name: "Edit" }).first()).toHaveAttribute("href", `/items/${id}/edit`);
    }).toPass({ timeout: 20_000 });

    // ...and "these words only" leaves it out.
    await page.goto(`${address}&exact=1`);
    await expect(status(page)).toContainText("No items match.");
    await expect(search(page).getByRole("checkbox", { name: "These words only" })).toBeChecked();
  });

  test("searches from the editor and inserts a result", async ({ page }) => {
    await page.goto("/write");
    const { sidebar, title, body, passage, status: saved } = editor(page);
    await title.fill("Drawing together");
    await sidebar.getByRole("tab", { name: "My content" }).click();
    const panel = sidebar.getByRole("tabpanel", { name: "My content" });
    const items = panel.getByRole("list", { name: "My content" }).getByRole("listitem");

    // A highlight by an overlapping passage: it goes in as its passage.
    await panel.getByRole("textbox", { name: "On passage" }).fill("Psalm 61:2");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Rock higher than I");
    await panel.getByRole("button", { name: "Insert Psalm 61:1-2" }).click();
    await expect(passage("Psalm 61:1-2")).toBeVisible();

    // Insert hands the cursor back to the post; wait for it before typing here.
    await expect(body).toBeFocused();

    // A reflection by tag, then words: it goes in as a link, and can be opened.
    // Each step changes the count, so none is met by the list before it.
    await panel.getByRole("textbox", { name: "On passage" }).fill("");
    await expect(panel.getByRole("textbox", { name: "On passage" })).toHaveValue("");
    await panel.getByRole("combobox", { name: "Tag" }).selectOption({ label: "#m10-refuge" });
    await expect(items).toHaveCount(2);
    await panel.getByRole("searchbox", { name: "Words" }).fill("quietly");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Waiting in silence");
    await expect(items.first().getByRole("link", { name: "Open Waiting in silence" })).toHaveAttribute(
      "href",
      `/items/${reflectionId}`,
    );
    await writeAtEnd(body, "See ");
    await panel.getByRole("button", { name: "Insert a link to Waiting in silence" }).click();
    await expect(body.getByRole("link", { name: "Waiting in silence" })).toHaveAttribute("href", `/items/${reflectionId}`);

    await expect(saved).toHaveText("Saved");
    const stored = await storedItem(editorId(page));
    expect(stored?.markdown).toContain("[[Psalm 61:1-2 | BSB]]");
    expect(stored?.markdown).toContain(`[Waiting in silence](/items/${reflectionId})`);
  });

  test("related passages show in the reader's panel, and open", async ({ page }) => {
    await page.goto("/read/romans-13");
    await clickVerse(page, 45013009);
    const section = panel(page).locator("[data-study-section='related']");
    await expect(section.getByRole("heading", { name: "Related" })).toBeVisible();
    const first = section.getByRole("listitem").first();
    await expect(first.getByRole("link")).toBeVisible();

    // Never the verses around the one selected, and no two the same.
    const references = await section.getByRole("listitem").getByRole("link").allTextContents();
    expect(references.length).toBeGreaterThan(1);
    expect(new Set(references).size).toBe(references.length);
    for (const reference of references) expect(reference).not.toMatch(/^Romans 13:(7|8|9|10|11|12)\b/);

    const reference = references[0];
    await first.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: reference })).toBeVisible();
  });

  test("related passages show in the editor's sidebar, and insert as a block", async ({ page }) => {
    await page.goto("/write");
    const { sidebar, title, passage } = editor(page);
    await title.fill("Love fulfils");
    await sidebar.getByRole("tab", { name: "Read" }).click();
    const read = sidebar.getByRole("tabpanel", { name: "Read" });
    await read.getByRole("textbox").first().fill("John 13:34-35");
    await read.getByRole("textbox").first().press("Enter");
    await read.getByRole("button", { name: /^Insert/ }).click();
    await expect(passage("John 13:34-35")).toBeVisible();

    // "Related" opens on the passage in the post.
    await sidebar.getByRole("tab", { name: "Related" }).click();
    const related = sidebar.getByRole("tabpanel", { name: "Related" });
    await expect(related.getByRole("textbox", { name: "Related to" })).toHaveValue("John 13:34-35");
    const list = related.getByRole("list", { name: "Related passages" }).getByRole("listitem");
    await expect(list.first()).toBeVisible();
    await expect(related).toContainText("Close in meaning");
    await expect(related.locator("[data-attribution='bsb']")).toBeVisible();

    const reference = await list.first().getAttribute("data-related");
    await list.first().getByRole("button", { name: `Insert ${reference}` }).click();
    await expect(passage(reference!)).toBeVisible();
    await expect(passage(reference!)).not.toBeEmpty();

    // Any other passage can be typed in.
    await related.getByRole("textbox", { name: "Related to" }).fill("Psalm 63:1");
    await related.getByRole("button", { name: "Find" }).click();
    await expect(list.first()).not.toHaveAttribute("data-related", reference!);
    await related.getByRole("textbox", { name: "Related to" }).fill("John 99");
    await related.getByRole("button", { name: "Find" }).click();
    await expect(related.getByRole("alert")).toContainText("John has 21 chapters");
  });

  test("exports everything, with no secrets", async ({ page }, testInfo) => {
    await page.goto("/items");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export everything" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^selah-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const saved = testInfo.outputPath("export.zip");
    await file.saveAs(saved);
    const files = unzipSync(readFileSync(saved));

    const json = strFromU8(files["selah-export.json"]);
    const exported = parseExport(json);
    expect(exported.version).toBe(1);
    expect(exported.site).toEqual({
      title: expect.any(String),
      handle: expect.any(String),
      defaultTranslation: "bsb",
    });

    // Every item of the owner's is in the JSON, and has a Markdown file.
    const ids = exported.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([highlightId, noteId, reflectionId]));
    const markdown = Object.keys(files).filter((name) => name.endsWith(".md"));
    expect(markdown).toHaveLength(exported.items.length);

    const reflection = exported.items.find((item) => item.id === reflectionId)!;
    expect(reflection).toMatchObject({
      kind: "reflection",
      title: "Waiting in silence",
      visibility: "unlisted",
      tags: [
        { slug: "m10-refuge", name: "m10-refuge" },
        { slug: "m10-silence", name: "m10-silence" },
      ],
      passages: [{ reference: "Psalm 62:1-2", verseStart: 19062001, verseEnd: 19062002, translation: "bsb" }],
    });
    expect(reflection.markdown).toContain("[[Psalm 62:1-2 | BSB]]");
    expect(reflection.permalink).toMatch(/^\/p\/waiting-in-silence-/);

    const page62 = strFromU8(files[markdown.find((name) => name.includes("/reflections/") && name.includes("waiting-in-silence"))!]);
    expect(page62).toMatch(/^---\n/);
    expect(page62).toContain(`title: "Waiting in silence"`);
    expect(page62).toContain("# Waiting in silence");
    expect(page62).toMatch(/^> .*\n>\n/m);
    expect(page62).toContain("— Psalm 62:1-2 (BSB). ");
    expect(page62).toContain("Berean Standard Bible");

    const highlight = strFromU8(files[markdown.find((name) => name.includes("/highlights/") && name.includes("psalm-61-1-2"))!]);
    expect(highlight).toContain("color: green");
    expect(highlight).toContain("Rock higher than I");

    const everything = Object.values(files).map((file) => strFromU8(file)).join("\n");
    expect(everything).not.toMatch(/\$argon2/);
    expect(everything).not.toContain(TEST_OWNER.password);
    expect(everything).not.toContain(TEST_OWNER.email);
    expect(everything).not.toMatch(/voyageApiKey|anthropicApiKey|passwordHash|sessionVersion/);
  });
});

test("a visitor cannot export, or use the sidebar's routes", async ({ page, request }) => {
  await page.goto("/export");
  await expect(page).toHaveURL("/sign-in?next=%2Fexport");
  expect((await request.get("/api/editor/related?ref=john+3:16")).status()).toBe(401);
  expect((await request.get("/api/editor/search?q=water&mode=meaning")).status()).toBe(401);
  expect((await request.get("/api/editor/items?q=water")).status()).toBe(401);
});

test("a visitor's study panel has Related too, and nothing of the owner's", async ({ page }) => {
  await page.goto("/read/romans-13.9?v=romans-13.9");
  await expect(panel(page).locator("[data-study-section='related']")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Rock higher than I");
});
