import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { createOwnerItem } from "./db";
import { OWNER_STATE } from "./owner";

// Journey 9: the public site. Feed at `/`, item permalinks, tag pages,
// passage pages (`/passage/rom-10` lists the items on Romans 10), RSS and Atom,
// Open Graph cards so a shared highlight previews as the verse. Private and
// unlisted items never appear in a feed or a listing. A link to an item by
// its id (/items/<id>) leads a visitor to its permalink.
//
// The items are made with the app's own functions (e2e/db.ts), the way the
// pages make them: the editor is not what this journey is about. Each run's
// items carry a word of their own, so a retry does not meet the first
// attempt's. The passages (Romans 10, John 6:35-36, Psalm 130:5-6) are this
// spec's alone.

const run = Date.now().toString(36);

const feedItem = (page: Page, text: string) => page.locator("[data-feed-item]").filter({ hasText: text });
const meta = (page: Page, key: string) =>
  page.locator(`meta[property="${key}"], meta[name="${key}"]`).first();

async function text(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), path).toBe(200);
  return { body: await response.text(), type: response.headers()["content-type"] };
}

test("journey 9: a visitor reads the public site, its feeds and its cards", async ({
  page,
  request,
  browser,
}) => {
  const tag = `bread-${run}`;
  const secretTag = `secret-${run}`;
  // The owner shares a highlight and publishes a reflection...
  const highlightId = await createOwnerItem(
    {
      kind: "highlight",
      color: "green",
      note: `The end of the law (${run})`,
      passages: [{ start: 45010004, end: 45010004 }],
      translationId: "bsb",
      tags: [{ slug: tag, name: `Bread ${run}` }],
    },
    "public",
  );
  const reflectionTitle = `I am the bread of life (${run})`;
  const reflectionId = await createOwnerItem(
    {
      kind: "reflection",
      title: reflectionTitle,
      markdown: `The crowd wanted bread, and He offered Himself.\n\n[[John 6:35-36 | KJV]]\n\nAnd the psalmist, waiting:\n\n[[Psalm 130:5-6]]\n\nMy **hope** is in His word.`,
      passages: [
        { start: 43006035, end: 43006036, translationId: "kjv" },
        { start: 19130005, end: 19130006, translationId: null },
      ],
      tags: [{ slug: tag, name: `Bread ${run}` }],
    },
    "public",
  );
  // ...and keeps one note private and another unlisted, on the same chapter.
  const privateText = `Private on Romans 10 (${run})`;
  const privateId = await createOwnerItem(
    {
      kind: "note",
      markdown: privateText,
      passages: [{ start: 45010009, end: 45010009 }],
      translationId: "bsb",
      tags: [{ slug: tag, name: `Bread ${run}` }, { slug: secretTag, name: secretTag }],
    },
    "private",
  );
  const unlistedText = `Unlisted on Romans 10 (${run})`;
  const unlistedId = await createOwnerItem(
    {
      kind: "note",
      markdown: unlistedText,
      passages: [{ start: 45010013, end: 45010013 }],
      translationId: "bsb",
      tags: [{ slug: tag, name: `Bread ${run}` }],
    },
    "unlisted",
  );
  const hidden = [privateText, unlistedText];
  const key = (id: string) => id.replace(/-/g, "").slice(0, 12);

  // --- The front page, signed out ---
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Selah" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New post" })).toHaveCount(0);
  const items = page.getByRole("list", { name: "Items" });
  const highlight = feedItem(page, `The end of the law (${run})`);
  await expect(highlight).toHaveAttribute("data-kind", "highlight");
  await expect(highlight).toHaveAttribute("data-highlight", "green");
  await expect(highlight.locator("[data-passage-card='Romans 10:4']")).toContainText(
    "Christ is the end of the law, to bring righteousness to everyone who believes.",
  );
  await expect(highlight.locator("[data-attribution='bsb']")).toBeVisible();
  const reflection = feedItem(page, reflectionTitle);
  await expect(reflection.locator("[data-passage-card='John 6:35-36']")).toContainText(
    "I am the bread of life",
  );
  await expect(reflection.locator("[data-card-translation='kjv']")).toBeVisible();
  await expect(reflection.locator("[data-attribution='kjv']")).toBeVisible();
  // Newest first: the reflection was published after the highlight.
  const order = await items.locator("[data-feed-item]").evaluateAll((articles) =>
    articles.map((article) => article.getAttribute("data-feed-item")),
  );
  expect(order.indexOf(reflectionId)).toBeLessThan(order.indexOf(highlightId));
  for (const words of hidden) await expect(page.getByText(words)).toHaveCount(0);
  // The footer lists where the texts come from.
  const footer = page.getByRole("contentinfo");
  await expect(footer.locator("[data-footer-source='bsb']")).toContainText("Berean Standard Bible");
  await expect(footer.locator("[data-footer-source='cross-references']")).toContainText(
    "OpenBible.info",
  );
  await expect(footer.locator("[data-footer-source='tyndale']")).toContainText("CC BY-SA");

  // --- A permalink ---
  await reflection.getByRole("link", { name: reflectionTitle }).click();
  await expect(page).toHaveURL(`/p/i-am-the-bread-of-life-${run}-${key(reflectionId)}`);
  await expect(page.getByRole("heading", { level: 1, name: reflectionTitle })).toBeVisible();
  await expect(page.locator("strong", { hasText: "hope" })).toBeVisible();
  // Its passages are laid out as the reader lays them out: red letters, and
  // lines of poetry.
  await expect(
    page.locator("[data-passage-card='John 6:35-36'] [data-words-of-jesus]").first(),
  ).toHaveText(/^I am the bread of life:/);
  const psalm = page.locator("[data-passage-card='Psalm 130:5-6']");
  await expect(psalm.locator("[data-line]")).toHaveText([
    /^5\s*I wait for the LORD; my soul does wait,$/,
    "and in His word I put my hope.",
    /^6\s*My soul waits for the Lord$/,
    "more than watchmen wait for the morning—",
    "more than watchmen wait for the morning.",
  ]);
  await expect(page).toHaveTitle(`${reflectionTitle} · Selah`);
  await expect(meta(page, "og:type")).toHaveAttribute("content", "article");
  await expect(meta(page, "og:title")).toHaveAttribute("content", reflectionTitle);
  await expect(meta(page, "og:description")).toHaveAttribute(
    "content",
    /^The crowd wanted bread, and He offered Himself/,
  );
  await expect(page.locator("meta[name='robots']")).toHaveCount(0);
  // Its key alone, or an old slug, lead to it.
  await page.goto(`/p/${key(reflectionId)}`);
  await expect(page).toHaveURL(`/p/i-am-the-bread-of-life-${run}-${key(reflectionId)}`);

  // A highlight's permalink previews as the verse.
  await page.goto(`/p/old-words-${key(highlightId)}`);
  await expect(page).toHaveURL(`/p/romans-10-4-${key(highlightId)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Romans 10:4" })).toBeAttached();
  await expect(meta(page, "og:title")).toHaveAttribute("content", "Romans 10:4");
  await expect(meta(page, "og:description")).toHaveAttribute(
    "content",
    `“For Christ is the end of the law, to bring righteousness to everyone who believes.” (Romans 10:4, BSB) The end of the law (${run})`,
  );
  await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary_large_image");
  const ogImage = (await meta(page, "og:image").getAttribute("content"))!;
  expect(new URL(ogImage).pathname).toBe(`/p/${key(highlightId)}/og.png`);
  await expect(meta(page, "twitter:image")).toHaveAttribute("content", ogImage);
  const image = await request.get(new URL(ogImage).pathname);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect((await image.body()).subarray(1, 4).toString()).toBe("PNG");

  // --- A tag page: public items only ---
  await page.goto("/");
  await feedItem(page, reflectionTitle).getByRole("link", { name: `#Bread ${run}` }).click();
  await expect(page).toHaveURL(`/tag/${tag}`);
  await expect(page.getByRole("heading", { level: 1, name: `#Bread ${run}` })).toBeVisible();
  const tagged = page.getByRole("list", { name: `Items tagged Bread ${run}` });
  await expect(tagged.locator("[data-feed-item]")).toHaveCount(2);
  for (const words of hidden) await expect(page.getByText(words)).toHaveCount(0);
  // A tag only a private item has is not there at all.
  expect((await request.get(`/tag/${secretTag}`)).status()).toBe(404);

  // --- A passage page: everything on overlapping verses ---
  await page.goto("/passage/rom-10");
  await expect(page).toHaveURL("/passage/romans-10");
  await expect(page.getByRole("heading", { level: 1, name: "Romans 10" })).toBeVisible();
  // The passage itself, in the default translation, and the way to the reader.
  const scripture = page.getByRole("region", { name: "Romans 10 (BSB)" });
  await expect(scripture.locator("[data-verse-id='45010004']")).toContainText(
    "Christ is the end of the law",
  );
  await expect(scripture.locator("[data-attribution='bsb']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read Romans 10 in the reader" })).toHaveAttribute(
    "href",
    "/read/romans-10",
  );
  const onRomans = page.getByRole("list", { name: "Items on Romans 10" });
  await expect(onRomans.locator("[data-feed-item]")).toHaveCount(1);
  await expect(onRomans.locator(`[data-feed-item='${highlightId}']`)).toBeVisible();
  for (const words of hidden) await expect(page.getByText(words)).toHaveCount(0);
  // Overlapping, not equal: John 6:35-37 finds the card on 35-36.
  await page.goto("/passage/john-6-35-37");
  await expect(page).toHaveURL("/passage/john-6.35-37");
  await expect(
    page.getByRole("list", { name: "Items on John 6:35-37" }).locator(`[data-feed-item='${reflectionId}']`),
  ).toBeVisible();

  // --- RSS and Atom ---
  const rss = await text(request, "/rss.xml");
  expect(rss.type).toBe("application/rss+xml; charset=utf-8");
  expect(rss.body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  expect(rss.body).toContain(`<title>${reflectionTitle}</title>`);
  expect(rss.body).toContain(`/p/romans-10-4-${key(highlightId)}</link>`);
  expect(rss.body).toContain("Christ is the end of the law, to bring righteousness to everyone who believes.");
  expect(rss.body).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
  const atom = await text(request, "/atom.xml");
  expect(atom.type).toBe("application/atom+xml; charset=utf-8");
  expect(atom.body).toContain(`<feed xmlns="http://www.w3.org/2005/Atom"`);
  expect(atom.body).toContain(`<title type="text">${reflectionTitle}</title>`);
  expect(atom.body).toContain("I am the bread of life");
  // The verses keep their lines and their red letters in a feed reader.
  expect(atom.body).toContain(
    "my soul does wait,&lt;br/&gt;and in His word I put my hope.&lt;br/&gt;&lt;sup&gt;6&lt;/sup&gt;",
  );
  expect(atom.body).toContain(
    "And Jesus said unto them, &lt;span class=&quot;words-of-jesus&quot; style=&quot;color:#b91c1c&quot;&gt;I am the bread of life:",
  );
  // The KJV's attribution travels with its card.
  expect(atom.body).toContain("King James (Authorized) Version");
  const tagFeed = await text(request, `/tag/${tag}/rss.xml`);
  expect(tagFeed.body.match(/<item>/g)).toHaveLength(2);
  const passageFeed = await text(request, "/passage/romans-10/atom.xml");
  expect(passageFeed.body.match(/<entry>/g)).toHaveLength(1);
  const sitemap = await text(request, "/sitemap.xml");
  expect(sitemap.body).toContain(`/p/romans-10-4-${key(highlightId)}</loc>`);
  for (const body of [rss.body, atom.body, tagFeed.body, passageFeed.body, sitemap.body]) {
    for (const words of hidden) expect(body).not.toContain(words);
    expect(body).not.toContain(key(privateId));
    expect(body).not.toContain(key(unlistedId));
  }

  // --- Unlisted: reachable by its link, kept out of search engines ---
  await page.goto(`/p/${key(unlistedId)}`);
  await expect(page).toHaveURL(new RegExp(`/p/unlisted-on-romans-10-${run}-${key(unlistedId)}$`));
  await expect(page.locator("[data-feed-body]")).toHaveText(unlistedText);
  await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  expect((await request.get(`/p/${key(unlistedId)}/og.png`)).status()).toBe(200);

  // --- Private: not found, for anyone but the owner ---
  const secret = await request.get(`/p/${key(privateId)}`);
  expect(secret.status()).toBe(404);
  expect(await secret.text()).not.toContain(privateText);
  expect((await request.get(`/p/${key(privateId)}/og.png`)).status()).toBe(404);

  // --- A post's link to another item (/items/<id>, as the editor writes
  // it) takes a visitor to that item's permalink, while it is not private ---
  await page.goto(`/items/${reflectionId}`);
  await expect(page).toHaveURL(`/p/i-am-the-bread-of-life-${run}-${key(reflectionId)}`);
  await page.goto(`/items/${unlistedId}`);
  await expect(page).toHaveURL(new RegExp(`/p/unlisted-on-romans-10-${run}-${key(unlistedId)}$`));
  const linkedSecret = await request.get(`/items/${privateId}`);
  expect(linkedSecret.status()).toBe(404);
  expect(await linkedSecret.text()).not.toContain(privateText);

  // The owner sees it, marked private, and is offered "New post" on the front page.
  const context = await browser.newContext({ storageState: OWNER_STATE });
  const owner = await context.newPage();
  await owner.goto(`/p/${key(privateId)}`);
  await expect(owner.locator("[data-feed-body]")).toHaveText(privateText);
  await expect(owner.locator("[data-visibility='private']")).toContainText("only you can see this");
  await expect(owner.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  // The same links take the owner to the item itself: its editor.
  await owner.goto(`/items/${reflectionId}`);
  await expect(owner).toHaveURL(`/items/${reflectionId}/edit`);
  await owner.goto("/");
  // The front page's own, prominent "New post", beside the owner bar's.
  await expect(owner.getByRole("main").getByRole("link", { name: "New post" })).toHaveAttribute(
    "href",
    "/write",
  );
  await expect(owner.getByText(privateText)).toHaveCount(0);
  await context.close();
});
