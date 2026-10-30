import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/db/client";
import { ClaudeError } from "@/lib/ai/claude";
import { createStubProvider } from "@/lib/ai/stub";
import type { AiProvider } from "@/lib/ai/types";

import { answerStream, capMessage, failureMessage, preflight, type AskEvent, type AskRequest } from "./ask";

const mocks = vi.hoisted(() => ({
  findAnswer: vi.fn(),
  reserveQuestion: vi.fn(),
  releaseQuestion: vi.fn(),
  saveAnswer: vi.fn(),
}));

vi.mock("./store", async (original) => ({ ...(await original<typeof import("./store")>()), ...mocks }));
vi.mock("./context", async (original) => ({
  ...(await original<typeof import("./context")>()),
  buildContext: async () => ({
    ranges: [{ start: 43003016, end: 43003016 }],
    reference: "John 3:16",
    translation: { id: "bsb", abbrev: "BSB", name: "BSB", attribution: "", sourceUrl: "" },
    items: [
      { id: "43003016", kind: "passage", range: { start: 43003016, end: 43003016 }, reference: "John 3:16", text: "For God so loved the world" },
      {
        id: "c1",
        kind: "study-note",
        range: { start: 43003016, end: 43003016 },
        reference: "John 3:16",
        text: "God gave his only Son for the world he loves",
        excerpt: false,
        source: { id: "tyndale", name: "Tyndale Open Study Notes", license: "CC BY-SA 4.0", attribution: "Tyndale attribution.", sourceUrl: "https://tyndaleopenresources.com/" },
      },
    ],
    leftOut: [],
  }),
}));

const db = {} as Db;
const request: AskRequest = {
  ranges: [{ start: 43003016, end: 43003016 }],
  translation: { id: "bsb", abbrev: "BSB", name: "BSB", attribution: "", sourceUrl: "" },
  question: "Why?",
  history: [],
  fresh: false,
};
const settings = { model: "m", cap: 5 };
const saved = { answer: { sections: [], dropped: [] }, sources: {} };

beforeEach(() => {
  mocks.findAnswer.mockReset().mockResolvedValue(undefined);
  mocks.reserveQuestion.mockReset().mockResolvedValue(true);
  mocks.releaseQuestion.mockReset().mockResolvedValue(undefined);
  mocks.saveAnswer.mockReset().mockResolvedValue(undefined);
});

async function run(provider: AiProvider = createStubProvider()) {
  const first = await preflight(db, request, settings);
  if (first.kind !== "go") throw new Error(first.kind);
  const events: AskEvent[] = [];
  for await (const event of answerStream(db, provider, request, first)) events.push(event);
  return events;
}

const failing = (error: Error, wrote?: string): AiProvider => ({
  ...createStubProvider(),
  async *stream() {
    if (wrote) yield wrote;
    throw error;
  },
});

describe("preflight", () => {
  it("answers a saved question at once and counts nothing", async () => {
    mocks.findAnswer.mockResolvedValue({ saved, createdAt: new Date("2026-10-30T00:00:00Z") });
    const first = await preflight(db, request, settings);
    expect(first).toMatchObject({ kind: "saved", event: { type: "saved", createdAt: "2026-10-30T00:00:00.000Z" } });
    expect(mocks.reserveQuestion).not.toHaveBeenCalled();
  });

  it("goes past a saved answer on Ask again, and counts", async () => {
    mocks.findAnswer.mockResolvedValue({ saved, createdAt: new Date() });
    const first = await preflight(db, { ...request, fresh: true }, settings);
    expect(first.kind).toBe("go");
    expect(mocks.findAnswer).not.toHaveBeenCalled();
    expect(mocks.reserveQuestion).toHaveBeenCalledOnce();
  });

  it("stops at the cap", async () => {
    mocks.reserveQuestion.mockResolvedValue(false);
    expect((await preflight(db, request, settings)).kind).toBe("capped");
  });

  it("says what the cap is and that saved answers stay", () => {
    expect(capMessage(50)).toContain("50 questions");
    expect(capMessage(50)).toContain("Saved answers still open");
    expect(capMessage(1)).toContain("1 question,");
  });
});

describe("answerStream", () => {
  it("sends the sources, then the answer as it comes, and saves it", async () => {
    const events = await run();
    expect(events[0].type).toBe("sources");
    expect(events.filter((event) => event.type === "segment").length).toBeGreaterThan(3);
    expect(events.at(-1)).toEqual({ type: "done", saved: true });
    expect(mocks.saveAnswer).toHaveBeenCalledOnce();
    expect(mocks.releaseQuestion).not.toHaveBeenCalled();
  });

  it("has every note it quotes carry its attribution and license", async () => {
    const events = await run();
    const quotes = events.flatMap((event) => (event.type === "segment" && event.segment.type === "quote" ? [event.segment.quote] : []));
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      expect(quote).toMatchObject({
        sourceId: "tyndale",
        license: "CC BY-SA 4.0",
        attribution: "Tyndale attribution.",
        sourceUrl: "https://tyndaleopenresources.com/",
        shareAlike: { licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
      });
    }
    const [[, , stored]] = mocks.saveAnswer.mock.calls;
    expect(JSON.stringify(stored)).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
  });

  it("does not save an answer that left a section out", async () => {
    const partial: AiProvider = {
      ...createStubProvider(),
      async *stream() {
        yield "## What the text says\n\nOnly this.\n";
      },
    };
    const events = await run(partial);
    expect(events.at(-1)).toEqual({ type: "done", saved: false });
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it("gives the question back when nothing came of it", async () => {
    const events = await run(failing(new ClaudeError("rate-limit", "x")));
    expect(events.at(-1)).toMatchObject({ type: "failed", message: expect.stringContaining("Try again") });
    expect(mocks.releaseQuestion).toHaveBeenCalledOnce();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it("keeps the count, and saves nothing, when an answer stopped halfway", async () => {
    await run(failing(new ClaudeError("incomplete", "x"), "## What the text says\n\nHalf"));
    expect(mocks.releaseQuestion).not.toHaveBeenCalled();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });
});

describe("failureMessage", () => {
  it("is calm, and points the owner to the key only when it is the key", () => {
    expect(failureMessage(new ClaudeError("key", "x"))).toContain("Settings");
    expect(failureMessage(new ClaudeError("rate-limit", "x"))).not.toContain("Settings");
    expect(failureMessage(new Error("sk-ant-secret"))).not.toContain("sk-ant");
  });
});
