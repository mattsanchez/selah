import { describe, expect, it } from "vitest";

import type { FeedEntry } from "@/lib/items/feed";
import type { Item } from "@/lib/items/queries";

import { entryDescription, itemOgCard } from "./public-feed";

const item = (values: Partial<Item>): Item => ({
  id: "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b",
  kind: "reflection",
  title: null,
  markdown: null,
  note: null,
  color: null,
  visibility: "public",
  publishedAt: new Date("2026-10-18T09:00:00Z"),
  createdAt: new Date("2026-10-18T09:00:00Z"),
  updatedAt: new Date("2026-10-18T09:00:00Z"),
  passages: [],
  tags: [],
  ...values,
});

const entry = (values: Partial<Item>): FeedEntry => ({
  item: item(values),
  blocks: [],
  translations: [],
  shareAlike: [],
});

// A post whose credit line was deleted, so nothing names the source.
const uncredited =
  "Mine.\n\n> Words of the note,\n> over two lines.\n>\n> > and a nested one.";

describe("a post with an uncredited quote", () => {
  it("keeps its words out of the meta and og descriptions", () => {
    expect(entryDescription(entry({ markdown: uncredited }))).toBe("Mine.");
  });

  it("keeps its words out of the image text", () => {
    const card = itemOgCard(
      entry({ title: "Title", markdown: uncredited }),
      "Selah",
    );
    expect(card).toMatchObject({
      kind: "article",
      title: "Title",
      excerpt: "Mine.",
    });
    const untitled = itemOgCard(entry({ markdown: uncredited }), "Selah");
    expect(untitled).toMatchObject({ title: "Mine." });
    expect(JSON.stringify([card, untitled])).not.toMatch(
      /words of the note|nested/i,
    );
    const note = itemOgCard(
      entry({ kind: "note", markdown: uncredited }),
      "Selah",
    );
    expect(JSON.stringify(note)).not.toMatch(/words of the note|nested/i);
  });

  it("falls back, when it is only a quote, to a generic name and an empty description", () => {
    const only = entry({
      kind: "note",
      markdown: "> Words of the note.\n>\n> Tyndale Open Study Notes",
    });
    expect(entryDescription(only)).toBe("");
    const card = itemOgCard(only, "Selah");
    expect(card).toMatchObject({ kind: "article", title: "Note", excerpt: "" });
    expect(JSON.stringify(card)).not.toMatch(/words of the note|tyndale/i);
  });
});
