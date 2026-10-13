import type { Page } from "@playwright/test";

// Finding and clicking verses in the reader, for the journeys that select
// them.

export const verse = (page: Page, id: number) => page.locator(`[data-verse-id='${id}']`).first();
export const panel = (page: Page) => page.getByRole("complementary");

// A point on the words of a verse: not its number, which is a link, nor a
// footnote marker. A verse's text wraps over several lines, so the middle of
// its box may be another verse.
async function wordsOf(page: Page, id: number): Promise<{ x: number; y: number }> {
  const point = await verse(page, id).evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest("a, sup")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      return { x: rect.x + Math.min(rect.width / 2, 40), y: rect.y + rect.height / 2 };
    }
    return null;
  });
  if (!point) throw new Error(`Verse ${id} has no text on the page`);
  return point;
}

export async function clickVerse(page: Page, id: number, modifier?: "Shift" | "ControlOrMeta") {
  const { x, y } = await wordsOf(page, id);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(x, y);
  if (modifier) await page.keyboard.up(modifier);
}
