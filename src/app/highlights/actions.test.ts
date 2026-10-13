import { beforeEach, describe, expect, it, vi } from "vitest";

// Every write needs the owner. requireOwner() sends anyone else to the
// sign-in page by throwing a redirect, as it does in the app; these tests
// check that each action calls it before it reads or writes anything.

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  hasVerses: vi.fn(),
  listTranslations: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/auth/owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/items/queries", () => ({
  createItem: mocks.createItem,
  updateItem: mocks.updateItem,
  deleteItem: mocks.deleteItem,
  hasVerses: mocks.hasVerses,
}));
vi.mock("@/lib/bible/passage", () => ({ listTranslations: mocks.listTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const { createHighlightAction, deleteHighlightAction, updateHighlightAction } = await import(
  "./actions"
);

const OWNER = { id: "0b6f3c9e-51a4-4a0b-9d0e-2f1c6a7b8c9d", email: "owner@selah.test" };
const ITEM = "7d0e2f1c-6a7b-4c9d-8b6f-3c9e51a44a0b";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const newHighlight = () =>
  form({ v: "john-3.16-17", p: "john-3.16-21", t: "bsb,web", translationId: "bsb", color: "green", note: "A note" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTranslations.mockResolvedValue([{ id: "bsb" }, { id: "web" }]);
  mocks.hasVerses.mockResolvedValue(true);
  mocks.updateItem.mockResolvedValue(true);
  mocks.deleteItem.mockResolvedValue(true);
});

describe("a visitor who is not signed in", () => {
  beforeEach(() => {
    mocks.requireOwner.mockRejectedValue(new Error("redirect:/sign-in"));
  });

  it("cannot make, change or delete a highlight", async () => {
    await expect(createHighlightAction({}, newHighlight())).rejects.toThrow("redirect:/sign-in");
    await expect(
      updateHighlightAction({}, form({ id: ITEM, color: "pink", note: "" })),
    ).rejects.toThrow("redirect:/sign-in");
    await expect(deleteHighlightAction(form({ id: ITEM }))).rejects.toThrow("redirect:/sign-in");

    expect(mocks.requireOwner).toHaveBeenCalledTimes(3);
    for (const touched of [
      mocks.createItem,
      mocks.updateItem,
      mocks.deleteItem,
      mocks.hasVerses,
      mocks.listTranslations,
    ]) {
      expect(touched).not.toHaveBeenCalled();
    }
  });
});

describe("the owner", () => {
  beforeEach(() => {
    mocks.requireOwner.mockResolvedValue(OWNER);
  });

  it("highlights the selected verses as a private highlight of their own", async () => {
    await expect(createHighlightAction({}, newHighlight())).rejects.toThrow(
      "redirect:/read/john-3.16-21?t=bsb,web",
    );
    expect(mocks.createItem).toHaveBeenCalledExactlyOnceWith(
      {},
      {
        ownerId: OWNER.id,
        kind: "highlight",
        passages: [{ start: 43003016, end: 43003017 }],
        translationId: "bsb",
        color: "green",
        note: "A note",
      },
    );
    // Nothing a form sends can make it anything but private.
    expect(mocks.createItem.mock.calls[0][1]).not.toHaveProperty("visibility");
  });

  it("is told what is wrong, and nothing is written", async () => {
    const bad = newHighlight();
    bad.set("color", "red");
    bad.set("note", "x".repeat(281));
    const state = await createHighlightAction({}, bad);
    expect(state.errors).toEqual({
      color: "Choose one of the colors.",
      note: "Keep the note to 280 characters; this one has 281.",
    });
    expect(state.values).toEqual({ color: "red", note: "x".repeat(281) });

    const nowhere = newHighlight();
    nowhere.set("v", "john-99.1");
    expect((await createHighlightAction({}, nowhere)).formError).toBe(
      "Select the verses to highlight first.",
    );

    mocks.hasVerses.mockResolvedValue(false);
    expect((await createHighlightAction({}, newHighlight())).formError).toBe(
      "None of the translations loaded here has those verses.",
    );
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("does not follow a return address that is not a passage", async () => {
    const data = newHighlight();
    data.set("p", "https://evil.example/");
    data.set("t", "bsb&next=//evil.example");
    await expect(createHighlightAction({}, data)).rejects.toThrow("redirect:/read/john-3.16-17");
  });

  it("changes only the color and note of one of their own highlights", async () => {
    const state = await updateHighlightAction(
      {},
      form({ id: ITEM, color: "pink", note: " Changed ", visibility: "public" }),
    );
    expect(state).toEqual({ saved: true });
    expect(mocks.updateItem).toHaveBeenCalledExactlyOnceWith(
      {},
      { ownerId: OWNER.id, id: ITEM, kind: "highlight" },
      { color: "pink", note: "Changed" },
    );
  });

  it("is told when the highlight is gone or its id is not one", async () => {
    mocks.updateItem.mockResolvedValue(false);
    const gone = await updateHighlightAction({}, form({ id: ITEM, color: "pink", note: "" }));
    expect(gone.formError).toMatch(/no longer exists/);

    mocks.updateItem.mockClear();
    const bad = await updateHighlightAction({}, form({ id: "1 or 1=1", color: "pink", note: "" }));
    expect(bad.formError).toMatch(/no longer exists/);
    expect(mocks.updateItem).not.toHaveBeenCalled();

    await deleteHighlightAction(form({ id: "not-an-id" }));
    expect(mocks.deleteItem).not.toHaveBeenCalled();
  });

  it("deletes one of their own highlights", async () => {
    await deleteHighlightAction(form({ id: ITEM }));
    expect(mocks.deleteItem).toHaveBeenCalledExactlyOnceWith(
      {},
      { ownerId: OWNER.id, id: ITEM, kind: "highlight" },
    );
  });
});
