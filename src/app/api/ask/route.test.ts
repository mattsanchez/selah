import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStubProvider } from "@/lib/ai/stub";

import { GET as commentators } from "./commentators/route";
import { POST } from "./route";
import { GET as suggest } from "./suggest/route";

const mocks = vi.hoisted(() => ({
  getOwner: vi.fn(),
  loadAiProvider: vi.fn(),
  preflight: vi.fn(),
  cards: vi.fn(),
  related: vi.fn(),
  site: vi.fn(),
}));

vi.mock("@/lib/auth/owner", () => ({ getOwner: mocks.getOwner }));
vi.mock("@/lib/ai/load", () => ({ loadAiProvider: mocks.loadAiProvider }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/bible/passage", () => ({
  listTranslations: async () => [{ id: "bsb", abbrev: "BSB", name: "BSB", attribution: "", sourceUrl: "" }],
}));
vi.mock("@/lib/site", () => ({ getDefaultTranslationId: async () => "bsb", getSite: mocks.site }));
vi.mock("@/lib/ask/ask", async (original) => ({ ...(await original<typeof import("@/lib/ask/ask")>()), preflight: mocks.preflight }));
vi.mock("@/lib/ask/commentators", () => ({ commentatorCards: mocks.cards }));
vi.mock("@/lib/ask/suggest", () => ({ suggestPassages: mocks.related }));

const OWNER = { id: "owner", email: "o@example.org" };
const off = { name: "none", answerModel: null };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/ask", { method: "POST", body: JSON.stringify(body), headers });
const asked = { reference: "John 3:16", translation: "bsb", question: "Why?" };
const get = (path: string) => new NextRequest(`http://localhost/api/ask/${path}?ref=John+3:16&t=bsb`);

const calls = [
  ["POST /api/ask", () => POST(post(asked))],
  ["GET /api/ask/suggest", () => suggest(get("suggest"))],
  ["GET /api/ask/commentators", () => commentators(get("commentators"))],
] as const;

beforeEach(() => {
  mocks.getOwner.mockReset().mockResolvedValue(OWNER);
  mocks.loadAiProvider.mockReset().mockResolvedValue(createStubProvider());
  mocks.preflight.mockReset().mockResolvedValue({ kind: "capped" });
  mocks.cards.mockReset().mockResolvedValue([]);
  mocks.related.mockReset().mockResolvedValue({ passages: [], meaning: false });
  mocks.site.mockReset().mockResolvedValue({ settings: { ask: { dailyCap: 9 } } });
});

describe.each(calls)("%s", (_, call) => {
  it("is the owner's alone, whatever the provider", async () => {
    mocks.getOwner.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.loadAiProvider).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.cards).not.toHaveBeenCalled();
  });

  it("is not there on an install that cannot answer", async () => {
    mocks.loadAiProvider.mockResolvedValue(off);
    expect((await call()).status).toBe(404);
  });
});

describe("POST /api/ask", () => {
  it("refuses an empty question, a long one, and a passage it cannot read", async () => {
    expect((await POST(post({ ...asked, question: "  " }))).status).toBe(400);
    expect((await POST(post({ ...asked, question: "x".repeat(501) }))).status).toBe(400);
    expect((await POST(post({ ...asked, reference: "Not A Book 9" }))).status).toBe(400);
    expect((await POST(new NextRequest("http://localhost/api/ask", { method: "POST", body: "not json" }))).status).toBe(400);
  });

  it("says so at the cap, from the owner's setting", async () => {
    const response = await POST(post(asked));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("9 questions");
    expect(mocks.preflight.mock.calls[0][2]).toEqual({ model: "stub-answers-1", cap: 9 });
  });

  it("takes a test's own cap only from the stub provider", async () => {
    await POST(post(asked, { "x-selah-test-cap": "1" }));
    expect(mocks.preflight.mock.calls[0][2].cap).toBe(1);

    mocks.loadAiProvider.mockResolvedValue({ ...createStubProvider(), name: "claude" });
    await POST(post(asked, { "x-selah-test-cap": "1" }));
    expect(mocks.preflight.mock.calls[1][2].cap).toBe(9);
  });

  it("sends a saved answer as one line", async () => {
    const event = { type: "saved", answer: { sections: [], dropped: [] }, sources: {}, createdAt: "2026-10-30T00:00:00.000Z" };
    mocks.preflight.mockResolvedValue({ kind: "saved", event });
    const response = await POST(post(asked));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(JSON.parse((await response.text()).trim())).toEqual(event);
  });
});

describe("the sidebar's lookups", () => {
  it("makes no call on the model", async () => {
    const provider = { ...createStubProvider(), stream: vi.fn(), complete: vi.fn() };
    mocks.loadAiProvider.mockResolvedValue(provider);
    await suggest(get("suggest"));
    await commentators(get("commentators"));
    expect(provider.stream).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });
});
