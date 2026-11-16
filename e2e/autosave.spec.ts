import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { backdateItem, createOwnerItem, deleteOwnerItems, saveElsewhere, storedItem } from "./db";
import { editor, publish, writeAtEnd } from "./editor";
import { OWNER_STATE } from "./owner";

// Autosave keeps every word typed: across a reload while a save is on its
// way, after publishing, with this browser's clock wrong, and when another
// tab or device has saved the post since (src/components/editor/use-autosave.ts).
// Text kept in the browser is never shown as saved before the server has it,
// never thrown away without asking, and never written over another save
// without asking.

test.use({ storageState: OWNER_STATE });

// The posts these tests write, made long ago and deleted after each test, so
// they never push another journey's items off the first page of "My items".
const made: string[] = [];
test.afterEach(async () => {
  await deleteOwnerItems(made.splice(0));
});

const isSave = (request: Request) =>
  request.method() === "POST" &&
  !!request.headers()["next-action"] &&
  (request.postData() ?? "").includes('"markdown"');

async function openReflection(page: Page, markdown: string) {
  const id = await createOwnerItem({ kind: "reflection", title: "Autosave", markdown, passages: [] });
  made.push(id);
  await backdateItem(id);
  await page.goto(`/items/${id}/edit`);
  const post = editor(page);
  await expect(post.body).toContainText(markdown);
  await expect(post.status).toHaveAttribute("data-save-status", "saved");
  return { id, post };
}

// The editor's notice that the post was saved elsewhere since.
const conflictNotice = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "changed in another tab or on another device" });

const stored = async (id: string) => (await storedItem(id))!.markdown!;

test("a save that lands after the last keystroke, then a reload before its answer, loses nothing typed after it", async ({
  page,
}) => {
  const { id, post } = await openReflection(page, "Start.");

  // The first save reaches the server, which makes it; its answer is lost
  // with the page.
  let reloaded!: () => void;
  const reload = new Promise<void>((resolve) => (reloaded = resolve));
  let held = false;
  await page.route("**/items/*/edit", async (route: Route) => {
    if (!isSave(route.request()) || held) return route.fallback();
    held = true;
    const response = await route.fetch();
    await reload;
    await route.fulfill({ response }).catch(() => {});
  });

  await writeAtEnd(post.body, " First part.");
  await page.waitForRequest((request) => isSave(request) && request.postData()!.includes("First part."));
  // Written while that save is on its way...
  await post.body.pressSequentially(" Second part.");
  await expect.poll(() => stored(id)).toContain("First part.");
  // ... and the page reloaded before its answer, and before the next save.
  await page.reload();
  reloaded();

  await expect(post.body).toContainText("Start. First part. Second part.");
  await expect(post.status).toHaveAttribute("data-save-status", "saved");
  expect(await stored(id)).toBe("Start. First part. Second part.");
});

test("text restored after a reload shows as not saved until the server has it", async ({ page }) => {
  const { id, post } = await openReflection(page, "Start.");
  // Never "Saved" with the restored text on screen while its save is held.
  await page.addInitScript(() => {
    const w = window as unknown as { savedTooSoon: boolean; released: boolean };
    w.savedTooSoon = false;
    w.released = false;
    new MutationObserver(() => {
      const status = document.querySelector("[data-save-status]")?.getAttribute("data-save-status");
      const restored = document.querySelector("[aria-label='Post body']")?.textContent?.includes("Kept here.");
      if (status === "saved" && restored && !w.released) w.savedTooSoon = true;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });

  await writeAtEnd(post.body, " Kept here.");
  // Saves wait until released.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/items/*/edit", async (route) => {
    if (!isSave(route.request())) return route.fallback();
    await released;
    await route.continue().catch(() => {});
  });
  await page.reload();

  await expect(post.body).toContainText("Start. Kept here.");
  await expect(post.status).not.toHaveAttribute("data-save-status", "saved");
  await page.waitForTimeout(1000);
  await expect(post.status).not.toHaveAttribute("data-save-status", "saved");
  expect(await stored(id)).toBe("Start.");

  await page.evaluate(() => ((window as unknown as { released: boolean }).released = true));
  release();
  await expect(post.status).toHaveAttribute("data-save-status", "saved");
  expect(await stored(id)).toBe("Start. Kept here.");
  expect(await page.evaluate(() => (window as unknown as { savedTooSoon: boolean }).savedTooSoon)).toBe(false);
});

test("after publishing, with this browser's clock behind the server's, a reload before the save loses nothing", async ({
  page,
}) => {
  await page.clock.install({ time: Date.now() - 10_000 });
  await page.clock.resume();
  const { id, post } = await openReflection(page, "Start.");
  await publish(page, "Public");
  await expect(post.publishButton).toHaveAttribute("data-publish-state", "public");

  await writeAtEnd(post.body, " After publishing.");
  await page.reload();

  await expect(post.body).toContainText("Start. After publishing.");
  await expect(post.status).toHaveAttribute("data-save-status", "saved");
  expect(await stored(id)).toBe("Start. After publishing.");
});

test.describe("another tab saved the post since", () => {
  test("a tab that did not see that save does not write over it, and keeps its own text until told", async ({
    context,
  }) => {
    const first = await context.newPage();
    const { id, post: a } = await openReflection(first, "Start.");
    const second = await context.newPage();
    await second.goto(`/items/${id}/edit`);
    const b = editor(second);
    await expect(b.status).toHaveAttribute("data-save-status", "saved");

    await writeAtEnd(a.body, " From the first tab.");
    await expect(a.status).toHaveAttribute("data-save-status", "saved");
    expect(await stored(id)).toBe("Start. From the first tab.");

    // The second tab still has "Start.": its save is refused, not made.
    await writeAtEnd(b.body, " From the second tab.");
    await expect(b.status).toHaveAttribute("data-save-status", "conflict");
    await expect(conflictNotice(second)).toBeVisible();
    // Writing on is kept, and still not saved over the first tab's.
    await b.body.pressSequentially(" More.");
    await second.waitForTimeout(1500);
    await expect(b.status).toHaveAttribute("data-save-status", "conflict");
    expect(await stored(id)).toBe("Start. From the first tab.");
    // Nor published.
    await b.publishButton.click();
    await second.getByRole("dialog").getByRole("button", { name: "Publish now" }).click();
    await expect(second.getByRole("dialog")).toContainText("Choose which text to keep first.");
    await second.keyboard.press("Escape");
    expect((await storedItem(id))!.visibility).toBe("private");

    // A reload keeps it, still unsaved.
    await second.reload();
    await expect(b.body).toContainText("Start. From the second tab. More.");
    await expect(b.status).toHaveAttribute("data-save-status", "conflict");
    expect(await stored(id)).toBe("Start. From the first tab.");

    // The writer chooses it.
    await second.getByRole("button", { name: "Save my text over it" }).click();
    await expect(b.status).toHaveAttribute("data-save-status", "saved");
    expect(await stored(id)).toBe("Start. From the second tab. More.");
    await expect(conflictNotice(second)).toHaveCount(0);

    // And the first tab, now behind, does not write over that either.
    await a.body.pressSequentially(" Again.");
    await expect(a.status).toHaveAttribute("data-save-status", "conflict");
    expect(await stored(id)).toBe("Start. From the second tab. More.");
  });

  test("the writer can throw the kept text away and open the saved version", async ({ page }) => {
    const { id, post } = await openReflection(page, "Start.");
    await saveElsewhere(id, "Start. Saved elsewhere.");
    await writeAtEnd(post.body, " Typed here.");
    await expect(post.status).toHaveAttribute("data-save-status", "conflict");

    await page.getByRole("button", { name: "Discard mine and open the saved version" }).click();
    await expect(post.body).toContainText("Start. Saved elsewhere.");
    await expect(post.body).not.toContainText("Typed here.");
    await expect(post.status).toHaveAttribute("data-save-status", "saved");
    expect(await page.evaluate((key) => localStorage.getItem(key), `selah:draft:${id}`)).toBeNull();
    expect(await stored(id)).toBe("Start. Saved elsewhere.");
  });
});

test("text kept in this browser is not lost, nor saved over, when another device saved the post since", async ({
  page,
}) => {
  const { id, post } = await openReflection(page, "Start.");
  // Offline: the text is kept here only.
  await page.route("**/items/*/edit", (route) => (isSave(route.request()) ? route.abort() : route.fallback()));
  await writeAtEnd(post.body, " Written offline.");
  await expect(post.status).toHaveAttribute("data-save-status", "failed");
  await page.unroute("**/items/*/edit");
  await page.goto("about:blank");

  // Meanwhile, from the phone.
  await saveElsewhere(id, "Start. From the phone.");

  await page.goto(`/items/${id}/edit`);
  await expect(post.body).toContainText("Start. Written offline.");
  await expect(post.status).toHaveAttribute("data-save-status", "conflict");
  await expect(conflictNotice(page)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await stored(id)).toBe("Start. From the phone.");

  await page.getByRole("button", { name: "Save my text over it" }).click();
  await expect(post.status).toHaveAttribute("data-save-status", "saved");
  expect(await stored(id)).toBe("Start. Written offline.");
});
