import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/db/client";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";

import { parseAnswer, verifyQuote } from "./answer";
import { CONTEXT_TOKENS, buildContext, citableOf, excerptFor, sourcesOf, tokensOf, type CommentaryItem } from "./context";
import { commentatorCards } from "./commentators";
import { renderContext } from "./prompt";

const mocks = vi.hoisted(() => ({
  verses: new Map<number, string>(),
  commentary: [] as unknown[],
  crossRefs: [] as unknown[],
  related: { passages: [] as unknown[], meaning: false },
  windows: [] as unknown[],
  hits: [] as unknown[],
  search: vi.fn(),
  embedQuery: vi.fn(),
}));

vi.mock("@/lib/bible/passage", () => ({
  getPassages: async (_: unknown, ids: string[], ranges: { start: number; end: number }[]) =>
    new Map(
      ids.map((id) => [
        id,
        ranges.map((range) =>
          [...mocks.verses.entries()]
            .filter(([verseId]) => verseId >= range.start && verseId <= range.end)
            .map(([verseId, text]) => ({ verseId, text, footnotes: verseId === 43003016 ? [{ offset: 0, text: "Or only begotten" }] : [] })),
        ),
      ]),
    ),
}));
vi.mock("@/lib/study/queries", () => ({
  getCommentary: async () => mocks.commentary,
  getCrossReferences: async () => mocks.crossRefs,
}));
vi.mock("@/lib/bible/search", () => ({ searchVerses: (...args: unknown[]) => mocks.search(...args) }));
vi.mock("@/lib/embeddings/related", () => ({ relatedPassages: async () => mocks.related }));
vi.mock("@/lib/embeddings/passages", () => ({
  embeddedTranslations: async () => ["bsb"],
  nearestWindows: async () => mocks.windows,
}));
vi.mock("@/lib/embeddings/query", () => ({ embedQuery: mocks.embedQuery }));

const db = {} as Db;
const translation = { id: "bsb", abbrev: "BSB", name: "Berean Standard Bible", attribution: "Public domain.", sourceUrl: "https://example.org" };
const offline = { name: "none" as const, embed: async () => [], embeddingModel: null, minSimilarity: 0 };
const withVectors = { ...offline, name: "stub" as const, embeddingModel: "stub", minSimilarity: 0.1 };
const JOHN = [{ start: 43003016, end: 43003017 }];

const row = (id: string, position = 1, kind = id === "tyndale" ? "study_notes" : "commentary") => {
  const source = COMMENTARY_SOURCES.find((each) => each.id === id);
  return {
    id,
    name: source?.name ?? id,
    kind,
    license: source?.license ?? "Public domain",
    attribution: source?.attribution ?? `${id}.`,
    sourceUrl: source?.sourceUrl ?? "https://example.org",
    position,
  };
};
const entry = (text: string, verseStart = 43003016, verseEnd = 43003016) => ({ verseStart, verseEnd, html: `<p>${text}</p>` });
const group = (id: string, ...entries: ReturnType<typeof entry>[]) => ({ source: row(id), entries });

beforeEach(() => {
  mocks.verses = new Map([
    [43003016, "For God so loved the world"],
    [43003017, "For God did not send his Son"],
    [45005008, "God proves his love for us"],
  ]);
  mocks.commentary = [];
  mocks.crossRefs = [];
  mocks.related = { passages: [], meaning: false };
  mocks.windows = [];
  mocks.search.mockReset().mockResolvedValue({ hits: [] });
  mocks.embedQuery.mockReset().mockResolvedValue(undefined);
});

const build = (question = "Why did God love?", options = {}) =>
  buildContext(db, JOHN, question, { translation, provider: offline, ...options });

describe("buildContext", () => {
  it("holds the passage a verse at a time, each with an id to cite", async () => {
    const { items, reference } = await build();
    expect(reference).toBe("John 3:16-17");
    expect(items.filter((item) => item.kind === "passage").map((item) => item.id)).toEqual(["43003016", "43003017"]);
  });

  it("holds the footnotes", async () => {
    const { items } = await build();
    expect(items.find((item) => item.kind === "footnote")).toMatchObject({ reference: "John 3:16", text: "Or only begotten" });
  });

  it("holds cross references with the words they point to, best voted first, not the passage's own", async () => {
    mocks.crossRefs = [
      { toStart: 43003017, toEnd: 43003017, votes: 90 },
      { toStart: 45005008, toEnd: 45005008, votes: 50 },
      { toStart: 66022021, toEnd: 66022021, votes: 10 },
    ];
    const { items } = await build();
    const cross = items.filter((item) => item.kind === "cross-reference");
    expect(cross.map((item) => item.reference)).toEqual(["Romans 5:8"]);
    expect(cross[0].id).toBe("45005008-45005008");
    expect(cross[0].text).toBe("God proves his love for us");
  });

  it("gives commentary and notes an id and their stored source", async () => {
    mocks.commentary = [group("matthew-henry", entry("Henry on love.")), group("tyndale", entry("A note on love."))];
    const { items } = await build();
    const [henry, tyndale] = items.filter((item) => item.kind === "commentary" || item.kind === "study-note") as CommentaryItem[];
    expect(henry).toMatchObject({ id: "c1", kind: "commentary", text: "Henry on love.", source: { id: "matthew-henry", license: "Public domain" } });
    expect(tyndale).toMatchObject({ id: "c2", kind: "study-note", text: "A note on love.", source: { id: "tyndale", license: "CC BY-SA 4.0" } });
  });

  it("reads a source only when it is registered", async () => {
    mocks.commentary = [group("gill", entry("Not registered.")), group("adam-clarke", entry("Registered."))];
    const rendered = renderContext(await build());
    expect(rendered).toContain("Registered.");
    expect(rendered).not.toContain("Not registered.");
  });

  it("takes each source's nearest entry before anyone's second", async () => {
    mocks.commentary = [
      group("matthew-henry", entry("H narrow."), entry("H wide.", 43003001, 43003036)),
      group("adam-clarke", entry("C narrow."), entry("C wide.", 43003001, 43003036)),
    ];
    const { items } = await build();
    expect(items.flatMap((item) => (item.kind === "commentary" ? [item.text] : []))).toEqual(["H narrow.", "C narrow.", "H wide.", "C wide."]);
  });

  it("leaves the opening reference out of an entry's words", async () => {
    mocks.commentary = [{ source: row("tyndale"), entries: [{ verseStart: 43003016, verseEnd: 43003016, html: '<p><span class="ref"><a data-verses="43003016-43003016">3:16</a></span> The note.</p>' }] }];
    const { items } = await build();
    expect(items.find((item) => item.kind === "study-note")).toMatchObject({ text: "The note." });
  });

  it("looks for related passages by meaning when there are vectors, not by keyword", async () => {
    mocks.embedQuery.mockResolvedValue([1, 0]);
    mocks.windows = [{ start: 45005008, end: 45005008, translationId: "bsb", similarity: 0.5 }];
    const { items } = await build("Why?", { provider: withVectors });
    expect(items.find((item) => item.kind === "related")).toMatchObject({ reference: "Romans 5:8" });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("falls back to the question's words without vectors", async () => {
    mocks.search.mockResolvedValue({ hits: [{ verseId: 45005008, text: [{ text: "God proves his love", match: true }] }] });
    const { items } = await build("Why did God love?");
    expect(mocks.search.mock.calls[0][1].query).toBe("why or god or love");
    expect(items.find((item) => item.kind === "keyword")).toMatchObject({ reference: "Romans 5:8", text: "God proves his love" });
  });

  it("keeps going when the vectors fail", async () => {
    mocks.embedQuery.mockRejectedValue(new Error("down"));
    await expect(build("Why?", { provider: withVectors })).resolves.toBeDefined();
  });
});

describe("the budget", () => {
  const long = (i: number) => `Verse ${i} ${"word ".repeat(40)}`;
  const allTokens = (context: Awaited<ReturnType<typeof build>>) =>
    context.items.reduce((sum, item) => sum + tokensOf(item.text), 0);

  it("stays inside the budget, and says what it left out", async () => {
    mocks.verses = new Map(Array.from({ length: 176 }, (_, i) => [19119001 + i, long(i)]));
    mocks.commentary = Array.from({ length: 4 }, (_, i) =>
      group(["matthew-henry", "jamieson-fausset-brown", "adam-clarke", "tyndale"][i], ...Array.from({ length: 6 }, (_, at) => entry("note ".repeat(390), 19119001, 19119001 + at))),
    );
    mocks.crossRefs = Array.from({ length: 60 }, (_, i) => ({ toStart: 45005008, toEnd: 45005008, votes: i }));
    const context = await buildContext(db, [{ start: 19119001, end: 19119176 }], "Why?", { translation, provider: offline });
    expect(allTokens(context)).toBeLessThanOrEqual(CONTEXT_TOKENS);
    expect(context.leftOut.find((left) => left.kind === "passage")?.count).toBeGreaterThan(0);
    expect(context.leftOut.find((left) => left.kind === "commentary")?.count).toBeGreaterThan(0);
    expect(context.items.some((item) => item.kind === "study-note")).toBe(true);
    expect(sourcesOf(context).leftOut).toEqual(context.leftOut);
  });

  it("names what was left out to the model too", async () => {
    mocks.verses = new Map(Array.from({ length: 176 }, (_, i) => [19119001 + i, long(i)]));
    const context = await buildContext(db, [{ start: 19119001, end: 19119176 }], "Why?", { translation, provider: offline });
    expect(renderContext(context)).toMatch(/Left out of the context to keep it short: \d+ verses of the passage/);
  });

  it("gives what a kind leaves unused to the next", async () => {
    mocks.commentary = [group("matthew-henry", entry("note ".repeat(390))), group("adam-clarke", entry("note ".repeat(390))), group("tyndale", entry("note ".repeat(390)))];
    const small = await buildContext(db, JOHN, "Why?", { translation, provider: offline, budgetTokens: 2400 });
    expect(small.items.filter((item) => item.kind === "commentary" || item.kind === "study-note").length).toBe(3);
  });

  it("never cites past the budget: what was left out cannot be linked", async () => {
    mocks.verses = new Map(Array.from({ length: 176 }, (_, i) => [19119001 + i, long(i)]));
    const context = await buildContext(db, [{ start: 19119001, end: 19119176 }], "Why?", { translation, provider: offline });
    const parsed = parseAnswer("## What the text says\n\n[[19119176]]\n\n## Interpretation\n\nx", citableOf(context));
    expect(parsed.dropped).toHaveLength(1);
  });
});

describe("excerptFor", () => {
  it("leaves a short text whole", () => {
    expect(excerptFor("Short.", ["short"])).toEqual({ text: "Short.", excerpt: false });
  });

  it("keeps the parts with the question's words, in their own order", () => {
    const text = ["Nothing here.", "Love is the key.", "Other things.", "God gave love."].join("\n");
    expect(excerptFor(text, ["love", "god"], 40)).toEqual({ text: "Love is the key.\n[…]\nGod gave love.", excerpt: true });
  });

  it("leaves no gap between parts that were next to each other", () => {
    const text = ["Love is here.", "God gave love.", "Nothing at all in this long line of other words."].join("\n");
    expect(excerptFor(text, ["love", "god"], 30).text).toBe("Love is here.\nGod gave love.");
  });

  it("will not let a quote run across what it left out as if nothing were missing", () => {
    const { text } = excerptFor(["Ends with grace.", "Nothing here to see.", "Love came next."].join("\n"), ["grace", "love"], 34);
    expect(verifyQuote("Ends with grace. Love came next.", text)).toBeUndefined();
    expect(verifyQuote("Ends with grace. […] Love came next.", text)).toEqual({ text: "Ends with grace. […] Love came next.", shortened: true });
  });

  it("cuts one long paragraph at a word", () => {
    const { text, excerpt } = excerptFor("word ".repeat(1000), ["word"], 100);
    expect(excerpt).toBe(true);
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.endsWith("word")).toBe(true);
  });
});

describe("what can be cited", () => {
  it("is the verses whose text was there, when a translation leaves one out of a range", async () => {
    mocks.verses = new Map([
      [43003016, "For God so loved the world"],
      [41009043, "If your hand causes you to stumble"],
      [41009045, "If your foot causes you to stumble"],
    ]);
    mocks.crossRefs = [{ toStart: 41009043, toEnd: 41009045, votes: 5 }];
    const context = await buildContext(db, [{ start: 43003016, end: 43003016 }], "Why?", { translation, provider: offline });
    const cited = (id: string) => parseAnswer(`## What the text says\n\n[[${id}]]\n\n## Interpretation\n\nx`, citableOf(context));
    expect(cited("41009044").dropped).toHaveLength(1);
    expect(cited("41009043-41009044").dropped).toHaveLength(1);
    expect(cited("41009045").dropped).toHaveLength(0);
    expect(cited("41009043-41009045").dropped).toHaveLength(0);
  });
});

describe("what the page is told", () => {
  it("lists sources with their stored attribution, and not the text sent", async () => {
    mocks.commentary = [group("tyndale", entry("A note with its own words."))];
    const sources = sourcesOf(await build());
    expect(sources.commentary[0]).toMatchObject({
      label: "Tyndale Open Study Notes (Protestant evangelical tradition)",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      attribution: COMMENTARY_SOURCES.find((source) => source.id === "tyndale")!.attribution,
    });
    expect(JSON.stringify(sources)).not.toContain("own words");
  });
});

describe("commentatorCards", () => {
  it("makes one card a commentator, each with its attribution and a link to the passage", async () => {
    mocks.commentary = [group("matthew-henry", entry("God so loved."), entry("Wider.", 43003001, 43003036)), group("tyndale", entry("God so loved it."))];
    const cards = await commentatorCards(db, JOHN, { translationId: "bsb" });
    expect(cards.map((card) => card.sourceId)).toEqual(["matthew-henry", "tyndale"]);
    expect(cards[0]).toMatchObject({ reference: "John 3:16", href: "/read/john-3.16", text: "God so loved.", label: "Matthew Henry (English Puritan tradition)" });
    expect(cards[1]).toMatchObject({ license: "CC BY-SA 4.0", shareAlike: { credit: "© 2022 Tyndale House Publishers" } });
    expect(cards[1].attribution).toContain("CC BY-SA 4.0");
  });

  it("leaves out sources that are not registered", async () => {
    mocks.commentary = [group("gill", entry("Not registered."))];
    expect(await commentatorCards(db, JOHN, { translationId: "bsb" })).toEqual([]);
  });
});
