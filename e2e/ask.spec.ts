import { expect, test, type Page } from "@playwright/test";

import { deleteItemsTagged, storedItem } from "./db";
import { editor, editorId, publish, setTags, writeAtEnd } from "./editor";
import { OWNER_STATE } from "./owner";

// Journey 8: asking about a passage. The stub provider answers (its answers
// are canned, built from the context it is given), so this is about the
// journey and not about how good an answer is: what is on the page, what links
// where, what is owed to whom, and that nothing lands in a post by itself.

// One after another: they share the day's count and the saved answers.
test.describe.configure({ mode: "serial" });

const PASSAGE = "/read/john-3.19-20";
// A question of its own per attempt: a retry must not find the first try's answer.
const question = (words: string) => `${words} (attempt ${test.info().retry})`;

const askPanel = (page: Page) => page.locator("[data-ask-panel]");
const lastTurn = (scope: { locator: Page["locator"] }) => scope.locator("[data-ask-turn]").last();

async function openAsk(page: Page) {
  await page.goto(PASSAGE);
  await page.getByRole("link", { name: "Ask about this passage" }).click();
  await expect(page).toHaveURL(`${PASSAGE}?ask=1`);
  await expect(askPanel(page).getByRole("heading", { level: 2 })).toHaveText("John 3:19-20");
}

async function ask(scope: { getByRole: Page["getByRole"] }, text: string) {
  await scope.getByRole("textbox", { name: "Your question" }).fill(text);
  await scope.getByRole("button", { name: "Ask", exact: true }).click();
}

test.describe("the owner", () => {
  test.use({ storageState: OWNER_STATE });

  test("asks in the reader and gets a streamed, cited, sectioned answer with its sources", async ({ page }) => {
    await openAsk(page);
    await ask(askPanel(page), question("Why do people love darkness?"));

    const turn = lastTurn(askPanel(page));
    // It fills as it is written, and the sources follow when it is done.
    await expect(turn).toHaveAttribute("data-ask-state", "streaming");
    await expect(turn.locator("[data-ask-sources]")).toHaveCount(0);
    await expect(turn).toHaveAttribute("data-ask-state", "done");

    const text = turn.locator("[data-ask-section='text']");
    const interpretation = turn.locator("[data-ask-section='interpretation']");
    await expect(text.getByRole("heading")).toHaveText("What the text says");
    await expect(interpretation.getByRole("heading")).toHaveText("Interpretation");
    await expect(text).toContainText("canned test answer");

    // A commentator is named with their tradition, by the app, on every quote.
    const quotes = interpretation.locator("[data-ask-quote]");
    const henry = interpretation.locator("[data-ask-quote='matthew-henry']");
    await expect(henry.locator("[data-quote-credit]")).toContainText("Matthew Henry (English Puritan tradition), Commentary on the Whole Bible");
    await expect(henry.locator("[data-quote-credit]")).toContainText("Public domain");

    const note = interpretation.locator("[data-ask-quote='tyndale']");
    const credit = note.locator("[data-quote-credit]");
    await expect(credit).toContainText("Adapted from Tyndale Open Study Notes");
    await expect(credit).toContainText("© 2022 Tyndale House Publishers");
    await expect(credit.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(credit.getByRole("link", { name: "Tyndale Open Study Notes" })).toHaveAttribute("href", "https://tyndaleopenresources.com/");
    await expect(quotes).toHaveCount(2);

    // The sources, each with what is owed to it.
    const sources = turn.locator("[data-ask-sources]");
    await expect(sources.getByRole("list", { name: "Verses" }).getByRole("link", { name: "John 3:19", exact: true })).toBeVisible();
    await expect(sources.locator("[data-source-verse][data-kind='cross-reference']").first()).toBeVisible();
    await expect(sources).toContainText("Cross references from OpenBible.info");
    await expect(sources.locator("[data-attribution='bsb']")).toBeVisible();
    await expect(sources.getByRole("list", { name: "Commentary" })).toContainText("Matthew Henry (English Puritan tradition)");
    await expect(sources.getByRole("list", { name: "Commentary" })).toContainText("Wesleyan Methodist");
    const tyndale = sources.locator("[data-source-commentary]").filter({ hasText: "Tyndale Open Study Notes" }).first();
    await expect(tyndale).toContainText("Adapted from Tyndale Open Study Notes");
    await expect(tyndale.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();

    // A citation is a working link into the reader.
    await text.locator("[data-citation='John 3:19']").click();
    await expect(page).toHaveURL("/read/john-3.19");
    await expect(page.getByRole("heading", { level: 1, name: "John 3:19" })).toBeVisible();
  });

  test("the same question again is a saved answer; Ask again goes back to the model", async ({ page }) => {
    await openAsk(page);
    const asked = question("Who hates the light?");
    await ask(askPanel(page), asked);
    const first = lastTurn(askPanel(page));
    await expect(first).toHaveAttribute("data-ask-state", "done");
    await expect(first.locator("[data-ask-saved]")).toHaveCount(0);

    // However it is typed, and on a fresh page: the conversation stays in the
    // tab, so this one starts over.
    await askPanel(page).getByRole("button", { name: "Start again" }).click();
    await ask(askPanel(page), `  ${asked.toUpperCase()}?  `);
    const saved = lastTurn(askPanel(page));
    await expect(saved.locator("[data-ask-saved]")).toHaveText("Saved answer");
    await expect(saved.locator("[data-ask-section='interpretation']")).toBeVisible();

    await saved.getByRole("button", { name: "Ask again" }).click();
    await expect(lastTurn(askPanel(page))).toHaveAttribute("data-ask-state", "done");
    await expect(askPanel(page).locator("[data-ask-saved]")).toHaveCount(0);
  });

  test("keeps the conversation in the tab, and goes on with a follow-up", async ({ page }) => {
    await openAsk(page);
    await ask(askPanel(page), question("What is the light?"));
    await expect(lastTurn(askPanel(page))).toHaveAttribute("data-ask-state", "done");
    await ask(askPanel(page), question("And the darkness?"));
    await expect(askPanel(page).locator("[data-ask-turn]")).toHaveCount(2);
    await expect(lastTurn(askPanel(page))).toHaveAttribute("data-ask-state", "done");

    await page.reload();
    await expect(askPanel(page).locator("[data-ask-turn]")).toHaveCount(2);
  });

  test("a citation outside the context is never a link", async ({ page }) => {
    await openAsk(page);
    await ask(askPanel(page), question("Something outside the context"));
    const turn = lastTurn(askPanel(page));
    await expect(turn).toHaveAttribute("data-ask-state", "done");
    await expect(turn.locator("[data-ask-dropped]")).toContainText("1 citation to verses outside these sources was removed.");
    await expect(turn.getByRole("link", { name: /Revelation/ })).toHaveCount(0);
    await expect(turn.locator("[data-ask-section='text']")).not.toContainText("66022021");
  });

  test("the daily cap stops a question with a clear message, and saved answers still open", async ({ page }) => {
    await openAsk(page);
    const before = question("What does the deed show?");
    await ask(askPanel(page), before);
    await expect(lastTurn(askPanel(page))).toHaveAttribute("data-ask-state", "done");
    await askPanel(page).getByRole("button", { name: "Start again" }).click();

    await page.setExtraHTTPHeaders({ "x-selah-test-cap": "0" });
    const refused = question("A question over the cap");
    await ask(askPanel(page), refused);
    await expect(askPanel(page).getByRole("alert")).toContainText("That's today's 0 questions");
    await expect(askPanel(page).getByRole("alert")).toContainText("Saved answers still open");
    await expect(askPanel(page).locator("[data-ask-turn]")).toHaveCount(0);
    await expect(askPanel(page).getByRole("textbox", { name: "Your question" })).toHaveValue(refused);

    await ask(askPanel(page), before);
    await expect(lastTurn(askPanel(page)).locator("[data-ask-saved]")).toHaveText("Saved answer");
  });

  test("the study panel has an Ask tab on the selected verses", async ({ page }) => {
    await page.goto("/read/john-3.19-20?v=john-3.20");
    await page.getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Ask" }).click();
    await expect(page).toHaveURL("/read/john-3.19-20?v=john-3.20&ask=1");
    await expect(askPanel(page).getByRole("heading", { level: 2 })).toHaveText("John 3:20");
    await askPanel(page).getByRole("navigation", { name: "Panel" }).getByRole("link", { name: "Study" }).click();
    await expect(page).toHaveURL("/read/john-3.19-20?v=john-3.20");
    await expect(page.getByRole("complementary", { name: "John 3:20" })).toContainText("Cross references");
  });

  test("Settings says how Ask stands, tests the key and never shows one", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("[data-ask-state='on']")).toContainText("of 50 questions");
    await expect(page.locator("[data-ask-used]")).not.toHaveText("0");
    await page.getByRole("button", { name: "Test the key" }).click();
    await expect(page.getByText("The key works.")).toBeVisible();
    await expect(page.locator("[data-ask-saved-count]")).not.toHaveText("0");
  });

  test("in the editor, Ask suggests and quotes, and nothing goes in without a click", async ({ page }) => {
    const TAG = "ask-journey";
    await deleteItemsTagged(TAG);
    await page.goto("/write");
    const { sidebar, title, body, passage, status } = editor(page);
    await title.fill("A reflection on the light");
    await writeAtEnd(body, "My own first thought.");
    await setTags(page, TAG);

    await sidebar.getByRole("tab", { name: "Ask" }).click();
    const panel = sidebar.getByRole("tabpanel", { name: "Ask" });
    await panel.getByRole("textbox", { name: "Passage" }).fill("John 3:21");

    const blocks = page.locator("[data-passage-block]");
    const quotes = body.locator(":scope > blockquote");

    // Suggest: a list, and no change to the post until Insert.
    await panel.getByRole("button", { name: "Suggest related passages" }).click();
    const suggestions = panel.locator("[data-ask-suggestions]").locator("[data-related]");
    await expect(suggestions.first()).toBeVisible();
    await expect(blocks).toHaveCount(0);
    const reference = (await suggestions.first().getAttribute("data-related"))!;
    await panel.getByRole("button", { name: `Insert ${reference}` }).first().click();
    await expect(passage(reference)).toBeVisible();
    await expect(blocks).toHaveCount(1);

    // Commentators: one attributed card each, and no change until Insert.
    await panel.getByRole("button", { name: "What do commentators say" }).click();
    const cards = panel.locator("[data-commentator]");
    await expect(panel.locator("[data-commentator='matthew-henry']")).toContainText("English Puritan tradition");
    await expect(panel.locator("[data-commentator='tyndale'] [data-quote-credit]")).toContainText("CC BY-SA 4.0");
    expect(await cards.count()).toBeGreaterThan(1);
    await expect(quotes).toHaveCount(0);
    await panel.getByRole("button", { name: /Insert the quote from Tyndale/ }).click();
    await expect(quotes).toHaveCount(1);
    await expect(quotes).toContainText("Tyndale Open Study Notes");
    await expect(quotes.getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();

    // An answer stays in the sidebar: its words have no way into the post.
    await ask(panel, question("What does judgment mean here?"));
    const turn = lastTurn(panel);
    await expect(turn).toHaveAttribute("data-ask-state", "done");
    await expect(body).not.toContainText("canned test answer");
    await expect(body).not.toContainText("What the text says");
    await expect(blocks).toHaveCount(1);
    await expect(quotes).toHaveCount(1);
    await expect(turn.getByRole("button", { name: /Insert.*(answer|all)/i })).toHaveCount(0);

    // One quote and one cited passage, each on its own click.
    await turn.getByRole("button", { name: /Insert the quote from Matthew Henry/ }).click();
    await expect(quotes).toHaveCount(2);
    await turn.getByRole("button", { name: "Insert John 3:21" }).click();
    await expect(passage("John 3:21")).toBeVisible();
    await expect(body).not.toContainText("canned test answer");

    // Quotes keep their credit through a save and a reload.
    await expect(status).toHaveText("Saved");
    const id = editorId(page);
    const saved = await storedItem(id);
    expect(saved?.markdown).toContain("My own first thought.");
    expect(saved?.markdown).toContain("[Tyndale Open Study Notes](https://tyndaleopenresources.com/)");
    expect(saved?.markdown).toMatch(/^> — Adapted from .*\[CC BY-SA 4\.0\]\(https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/\)/m);
    expect(saved?.markdown).toContain("(/read/john-3.16-21)");
    expect(saved?.markdown).not.toContain("canned test answer");

    await page.reload();
    await expect(quotes).toHaveCount(2);
    await expect(quotes.first().getByRole("link", { name: "CC BY-SA 4.0" })).toBeVisible();

    // Published, the license goes with the quote wherever the post is printed.
    await publish(page, "Public");
    await expect(page.locator("[data-publish-state]")).toHaveAttribute("data-publish-state", /public/i);
    await page.goto("/");
    const entry = page.locator(`[data-feed-item='${id}']`);
    await expect(entry.locator("[data-share-alike='tyndale']")).toContainText("CC BY-SA 4.0");
    await expect(entry.locator("[data-share-alike='tyndale']").getByRole("link", { name: "License" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    await entry.getByRole("link", { name: "A reflection on the light" }).click();
    await expect(page.locator("[data-share-alike='tyndale']")).toContainText("The rest of this post is the author’s own");

    const atom = await (await page.request.get("/atom.xml")).text();
    expect(atom).toContain("licensed CC BY-SA 4.0");
    const rss = await (await page.request.get("/rss.xml")).text();
    expect(rss).toContain("licensed CC BY-SA 4.0");

    await deleteItemsTagged(TAG);
  });
});

test.describe("in a note", () => {
  test.use({ storageState: OWNER_STATE });

  test("a quote goes in too, though a note has no passage blocks", async ({ page }) => {
    await page.goto("/write?kind=note");
    const { sidebar, note } = editor(page);
    await page.getByRole("button", { name: "Study" }).click();
    await sidebar.getByRole("tab", { name: "Ask" }).click();
    const panel = sidebar.getByRole("tabpanel", { name: "Ask" });
    await panel.getByRole("textbox", { name: "Passage" }).fill("John 3:21");
    await panel.getByRole("button", { name: "What do commentators say" }).click();
    await panel.getByRole("button", { name: /Insert the quote from Tyndale/ }).click();
    await expect(note.locator(":scope > blockquote")).toContainText("Tyndale Open Study Notes");
  });
});

test.describe("a visitor", () => {
  test("sees nothing of Ask and gets 401 from the API", async ({ page, request }) => {
    await page.goto(PASSAGE);
    await expect(page.getByRole("heading", { level: 1, name: "John 3:19-20" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Ask about/ })).toHaveCount(0);
    await page.goto(`${PASSAGE}?ask=1`);
    await expect(page.locator("[data-ask-panel]")).toHaveCount(0);
    await page.goto(`${PASSAGE}?v=john-3.20`);
    await expect(page.getByRole("complementary", { name: "John 3:20" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Panel" })).toHaveCount(0);

    const asked = await request.post("/api/ask", { data: { reference: "John 3:19", question: "Why?" } });
    expect(asked.status()).toBe(401);
    expect((await request.get("/api/ask/suggest?ref=John+3:19")).status()).toBe(401);
    expect((await request.get("/api/ask/commentators?ref=John+3:19")).status()).toBe(401);
  });
});
