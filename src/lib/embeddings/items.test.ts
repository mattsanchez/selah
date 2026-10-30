import { afterEach, describe, expect, it, vi } from "vitest";

import { itemEmbeddingText, scheduleItemEmbedding } from "./items";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/load", () => ({ loadAiProvider: load }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

describe("itemEmbeddingText", () => {
  const reflection = { kind: "reflection", title: null, markdown: null, note: null };

  it("is the title and the words, without Markdown or passage cards", () => {
    const text = itemEmbeddingText({
      ...reflection,
      title: "On abiding",
      markdown: "[[John 15:1-5 | BSB]]\n\nThe **branch** does not strain.\n\n[[Romans 8:28]]\n\nIt stays.",
    });
    expect(text).toBe("On abiding\nThe branch does not strain. It stays.");
  });

  it("is nothing for a highlight, whose words are the Bible's", () => {
    expect(itemEmbeddingText({ ...reflection, kind: "highlight", note: "A note on it" })).toBe("");
  });

  it("is nothing for a post with only a card or nothing in it", () => {
    expect(itemEmbeddingText({ ...reflection, markdown: "[[John 3:16]]" })).toBe("");
    expect(itemEmbeddingText(reflection)).toBe("");
  });

  it("keeps the cost of a very long post bounded", () => {
    const text = itemEmbeddingText({ ...reflection, markdown: "word ".repeat(10_000) });
    expect(text.length).toBeLessThan(8_100);
  });
});

describe("scheduleItemEmbedding", () => {
  afterEach(() => {
    vi.useRealTimers();
    load.mockReset();
  });

  it("returns at once, and waits for the saves to stop", async () => {
    vi.useFakeTimers();
    load.mockResolvedValue({ embeddingModel: null });
    scheduleItemEmbedding("item-1", 1000);
    await vi.advanceTimersByTimeAsync(600);
    scheduleItemEmbedding("item-1", 1000);
    await vi.advanceTimersByTimeAsync(600);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("swallows every failure: a save never hears of one", async () => {
    vi.useFakeTimers();
    load.mockRejectedValue(new Error("no database"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    expect(() => scheduleItemEmbedding("item-2", 10)).not.toThrow();
    await vi.advanceTimersByTimeAsync(20);
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
