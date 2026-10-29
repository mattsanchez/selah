import { beforeEach, describe, expect, it, vi } from "vitest";

// Every write needs the owner, as in src/app/highlights/actions.test.ts; and
// what the editor saves keeps `item_passage` in step with the document.

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  getItem: vi.fn(),
  saveItemContent: vi.fn(),
  setVisibility: vi.fn(),
  listTranslations: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/auth/owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/items/queries", () => ({
  createItem: mocks.createItem,
  deleteItem: mocks.deleteItem,
  getItem: mocks.getItem,
  saveItemContent: mocks.saveItemContent,
  setVisibility: mocks.setVisibility,
}));
vi.mock("@/lib/bible/passage", () => ({ listTranslations: mocks.listTranslations }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const {
  createDraftAction,
  createReflectionAction,
  deleteItemAction,
  publishItemAction,
  saveItemAction,
  setVisibilityAction,
} = await import("./actions");

const OWNER = { id: "0b6f3c9e-51a4-4a0b-9d0e-2f1c6a7b8c9d", email: "owner@selah.test" };
const ITEM = "7d0e2f1c-6a7b-4c9d-8b6f-3c9e51a44a0b";
const SAVED = new Date("2026-10-13T12:00:00Z");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const draft = (changes = {}) => ({ id: ITEM, title: "", markdown: "", tags: "", ...changes });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTranslations.mockResolvedValue([
    { id: "bsb", abbrev: "BSB" },
    { id: "kjv", abbrev: "KJV" },
  ]);
  mocks.createItem.mockResolvedValue(ITEM);
  mocks.getItem.mockResolvedValue({ id: ITEM, kind: "reflection", updatedAt: SAVED, publishedAt: null });
  mocks.saveItemContent.mockResolvedValue(SAVED);
  mocks.setVisibility.mockResolvedValue(true);
  mocks.deleteItem.mockResolvedValue(true);
});

describe("a visitor who is not signed in", () => {
  beforeEach(() => {
    mocks.requireOwner.mockRejectedValue(new Error("redirect:/sign-in"));
  });

  it("cannot write, publish or delete anything", async () => {
    const refused = "redirect:/sign-in";
    await expect(createReflectionAction(form({ v: "john-3.16" }))).rejects.toThrow(refused);
    await expect(createDraftAction({ ...draft({ markdown: "Hi" }), kind: "note" })).rejects.toThrow(refused);
    await expect(publishItemAction({ id: ITEM, visibility: "public" })).rejects.toThrow(refused);
    await expect(saveItemAction(draft({ markdown: "Changed" }))).rejects.toThrow(refused);
    await expect(setVisibilityAction(form({ id: ITEM, visibility: "public" }))).rejects.toThrow(refused);
    await expect(deleteItemAction(form({ id: ITEM }))).rejects.toThrow(refused);

    expect(mocks.requireOwner).toHaveBeenCalledTimes(6);
    for (const touched of [
      mocks.createItem,
      mocks.deleteItem,
      mocks.getItem,
      mocks.saveItemContent,
      mocks.setVisibility,
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

  it("reflects on the selected verses: a private draft with their card, and its passage", async () => {
    await expect(
      createReflectionAction(form({ v: "romans-8.38-39", translationId: "kjv" })),
    ).rejects.toThrow(`redirect:/items/${ITEM}/edit`);
    expect(mocks.createItem).toHaveBeenCalledExactlyOnceWith(
      {},
      {
        ownerId: OWNER.id,
        kind: "reflection",
        markdown: "[[Romans 8:38-39 | KJV]]",
        passages: [{ start: 45008038, end: 45008039, translationId: "kjv" }],
      },
    );
  });

  it("starts a reflection on no passage", async () => {
    await expect(createReflectionAction(form({}))).rejects.toThrow(`redirect:/items/${ITEM}/edit`);
    expect(mocks.createItem.mock.calls[0][1]).toMatchObject({ markdown: "", passages: [] });
  });

  it("makes a new reflection by its first save, with the passages of its cards", async () => {
    const result = await createDraftAction({
      kind: "reflection",
      title: " Abide ",
      markdown: "[[John 15:4-5 | KJV]]\n\nRemain.",
      tags: "Abiding",
    });
    expect(result).toEqual({ ok: true, id: ITEM, savedAt: SAVED.toISOString() });
    expect(mocks.createItem).toHaveBeenCalledExactlyOnceWith(
      {},
      {
        ownerId: OWNER.id,
        kind: "reflection",
        title: "Abide",
        markdown: "[[John 15:4-5 | KJV]]\n\nRemain.",
        tags: [{ slug: "abiding", name: "Abiding" }],
        passages: [{ start: 43015004, end: 43015005, translationId: "kjv" }],
      },
    );
  });

  it("makes a new note on the verses it was written on, private until posted", async () => {
    await createDraftAction({
      kind: "note",
      title: "ignored",
      markdown: "Be still.",
      tags: "rest",
      v: "psalm-46.10",
      translationId: "kjv",
    });
    expect(mocks.createItem).toHaveBeenCalledExactlyOnceWith(
      {},
      {
        ownerId: OWNER.id,
        kind: "note",
        title: null,
        markdown: "Be still.",
        tags: [{ slug: "rest", name: "rest" }],
        visibility: "private",
        passages: [{ start: 19046010, end: 19046010 }],
        translationId: "kjv",
      },
    );
  });

  it("makes nothing that is not valid, and says why", async () => {
    expect(await createDraftAction({ kind: "note", title: "", markdown: "  ", tags: "" })).toEqual({
      ok: false,
      errors: { markdown: "Write the note first." },
    });
    expect(await createDraftAction({ kind: "highlight", title: "", markdown: "x", tags: "" } as never)).toMatchObject({
      ok: false,
    });
    expect(await createDraftAction(null as never)).toMatchObject({ ok: false });
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it("publishes from the editor and answers with what the item now is", async () => {
    const published = new Date("2026-10-14T08:00:00Z");
    mocks.getItem
      .mockResolvedValueOnce({ id: ITEM, kind: "reflection" })
      .mockResolvedValueOnce({ id: ITEM, kind: "reflection", publishedAt: published });
    expect(await publishItemAction({ id: ITEM, visibility: "unlisted" })).toEqual({
      ok: true,
      visibility: "unlisted",
      publishedAt: published.toISOString(),
    });
    expect(mocks.setVisibility).toHaveBeenCalledExactlyOnceWith({}, { ownerId: OWNER.id, id: ITEM }, "unlisted");

    mocks.getItem.mockResolvedValue({ id: ITEM, kind: "highlight" });
    expect(await publishItemAction({ id: ITEM, visibility: "public" })).toMatchObject({ ok: false });
    expect(await publishItemAction({ id: ITEM, visibility: "everyone" })).toMatchObject({ ok: false });
    expect(await publishItemAction({ id: "nope", visibility: "public" })).toMatchObject({ ok: false });
    expect(mocks.setVisibility).toHaveBeenCalledTimes(1);
  });

  it("saves a reflection with the passages of the cards in it", async () => {
    const markdown = "[[John 3:16-17 | KJV]]\n\nFor God so loved.\n\n[[Psalm 23:1]]\n";
    const result = await saveItemAction(draft({ title: " Love ", markdown, tags: "love" }));
    expect(result).toEqual({ ok: true, savedAt: SAVED.toISOString() });
    expect(mocks.saveItemContent).toHaveBeenCalledExactlyOnceWith(
      {},
      { ownerId: OWNER.id, id: ITEM },
      {
        title: "Love",
        markdown,
        tags: [{ slug: "love", name: "love" }],
        passages: [
          { start: 19023001, end: 19023001, translationId: null },
          { start: 43003016, end: 43003017, translationId: "kjv" },
        ],
      },
    );
  });

  it("empties a reflection's passages when its last card is removed", async () => {
    await saveItemAction(draft({ markdown: "No cards now." }));
    expect(mocks.saveItemContent.mock.calls[0][2]).toMatchObject({ passages: [] });
  });

  it("saves a note's text and leaves the verses it is on alone", async () => {
    mocks.getItem.mockResolvedValue({ id: ITEM, kind: "note" });
    await saveItemAction(draft({ title: "ignored", markdown: "Still.\n[[John 3:16]]", tags: "" }));
    const saved = mocks.saveItemContent.mock.calls[0][2];
    expect(saved).toMatchObject({ title: null, markdown: "Still.\n[[John 3:16]]" });
    expect(saved.passages).toBeUndefined();
  });

  it("saves nothing that is not a reflection or a note of the owner's", async () => {
    mocks.getItem.mockResolvedValue({ id: ITEM, kind: "highlight" });
    expect(await saveItemAction(draft())).toMatchObject({ ok: false, formError: /no longer exists/ });
    mocks.getItem.mockResolvedValue(undefined);
    expect(await saveItemAction(draft())).toMatchObject({ ok: false });
    expect(await saveItemAction(draft({ id: "1 or 1=1" }))).toMatchObject({ ok: false });
    // Called by hand with something that is not what the editor sends.
    expect(await saveItemAction({ id: ITEM } as never)).toMatchObject({ ok: false });
    expect(await saveItemAction(null as never)).toMatchObject({ ok: false });
    expect(mocks.saveItemContent).not.toHaveBeenCalled();
  });

  it("is told what is wrong with what was typed, and it is not saved", async () => {
    const result = await saveItemAction(draft({ tags: "x".repeat(41) }));
    expect(result).toEqual({ ok: false, errors: { tags: "Keep each tag to 40 characters." } });
    expect(mocks.saveItemContent).not.toHaveBeenCalled();
  });

  it("shares, publishes and unpublishes one of their own items", async () => {
    for (const visibility of ["public", "unlisted", "private"]) {
      await setVisibilityAction(form({ id: ITEM, visibility }));
      expect(mocks.setVisibility).toHaveBeenLastCalledWith({}, { ownerId: OWNER.id, id: ITEM }, visibility);
    }
    await setVisibilityAction(form({ id: ITEM, visibility: "everyone" }));
    await setVisibilityAction(form({ id: "not-an-id", visibility: "public" }));
    expect(mocks.setVisibility).toHaveBeenCalledTimes(3);
  });

  it("deletes one of their own items and returns to the list", async () => {
    await expect(deleteItemAction(form({ id: ITEM }))).rejects.toThrow("redirect:/items");
    expect(mocks.deleteItem).toHaveBeenCalledExactlyOnceWith({}, { ownerId: OWNER.id, id: ITEM });
  });
});
