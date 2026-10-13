import { describe, expect, it } from "vitest";

import {
  MAX_ITEM_PASSAGES,
  MAX_ITEM_TITLE_LENGTH,
  MAX_MARKDOWN_LENGTH,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_LENGTH,
  normalizeNote,
  parsePassages,
  validateContent,
  validateHighlightEdit,
  validateNewHighlight,
  validateNotePost,
} from "./validate";

const translations = ["bsb", "web", "kjv"];

describe("normalizeNote", () => {
  it("keeps a note to one line and drops an empty one", () => {
    expect(normalizeNote("  God's love \n\n and the light\t")).toBe("God's love and the light");
    expect(normalizeNote("")).toBeNull();
    expect(normalizeNote(" \n ")).toBeNull();
  });
});

describe("parsePassages", () => {
  it("reads verses as the reader's `v` parameter writes them, normalized", () => {
    expect(parsePassages("john-3.16-18,20")).toEqual([
      { start: 43003016, end: 43003018 },
      { start: 43003020, end: 43003020 },
    ]);
    expect(parsePassages("john-3.20,16,17")).toEqual([
      { start: 43003016, end: 43003017 },
      { start: 43003020, end: 43003020 },
    ]);
    expect(parsePassages("Romans 8:28; John 3:16")).toEqual([
      { start: 43003016, end: 43003016 },
      { start: 45008028, end: 45008028 },
    ]);
  });

  it("refuses verses that do not exist, and nonsense", () => {
    for (const v of ["", "john-3.99", "john-22.1", "hezekiah-1.1", "43003016", "john-3.18-16"]) {
      expect(parsePassages(v)).toBeUndefined();
    }
  });

  it("refuses more runs of verses than a hand selects", () => {
    // Every other verse of Psalm 119: 88 runs, then all of them with more.
    const odd = (count: number) =>
      Array.from({ length: count }, (_, i) => `psalm-119.${2 * i + 1}`).join(";");
    expect(parsePassages(odd(88))).toHaveLength(88);
    expect(parsePassages(`${odd(88)};${odd(20).replace(/psalm-119/g, "psalm-78")}`)).toBeUndefined();
    expect(MAX_ITEM_PASSAGES).toBe(100);
  });
});

describe("validateNewHighlight", () => {
  const input = { v: "john-3.16-17", color: "green", note: " For God so loved ", translationId: "web" };

  it("accepts verses, a palette color and an optional note", () => {
    expect(validateNewHighlight(input, translations)).toEqual({
      ok: true,
      value: {
        passages: [{ start: 43003016, end: 43003017 }],
        color: "green",
        note: "For God so loved",
        translationId: "web",
      },
    });
    const bare = validateNewHighlight({ ...input, note: "" }, translations);
    expect(bare.ok && bare.value.note).toBeNull();
  });

  it("does not record a translation that is not loaded", () => {
    const result = validateNewHighlight({ ...input, translationId: "niv" }, translations);
    expect(result.ok && result.value.translationId).toBeNull();
    const none = validateNewHighlight({ ...input, translationId: undefined }, translations);
    expect(none.ok && none.value.translationId).toBeNull();
  });

  it("refuses a color outside the palette", () => {
    for (const color of ["", "red", "#ff0000", "Yellow", "yellow\"><script>"]) {
      const result = validateNewHighlight({ ...input, color }, translations);
      expect(result).toEqual({ ok: false, errors: { color: "Choose one of the colors." } });
    }
  });

  it("refuses a note that is too long, counted after it is tidied", () => {
    const fits = validateNewHighlight({ ...input, note: ` ${"a".repeat(MAX_NOTE_LENGTH)} ` }, translations);
    expect(fits.ok).toBe(true);
    const long = validateNewHighlight({ ...input, note: "a".repeat(MAX_NOTE_LENGTH + 1) }, translations);
    expect(long).toEqual({
      ok: false,
      errors: { note: "Keep the note to 280 characters; this one has 281." },
    });
  });

  it("refuses to highlight nothing, and reports every problem at once", () => {
    expect(validateNewHighlight({ ...input, v: "" }, translations)).toEqual({
      ok: false,
      errors: { passage: "Select the verses to highlight first." },
    });
    const result = validateNewHighlight({ v: "john-99", color: "x", note: "" }, translations);
    expect(result.ok ? [] : Object.keys(result.errors).sort()).toEqual(["color", "passage"]);
  });
});

describe("validateHighlightEdit", () => {
  it("checks the color and the note alone", () => {
    expect(validateHighlightEdit({ color: "pink", note: "" })).toEqual({
      ok: true,
      value: { color: "pink", note: null },
    });
    expect(validateHighlightEdit({ color: "", note: "x" }).ok).toBe(false);
  });
});

describe("validateContent", () => {
  it("takes a reflection's title, Markdown and tags", () => {
    expect(
      validateContent(
        { title: "  On \n grace ", markdown: "By grace.\r\n\r\n[[John 3:16]]\n", tags: "Grace, #hope" },
        "reflection",
      ),
    ).toEqual({
      ok: true,
      value: {
        title: "On grace",
        // As typed, but for the line endings: the editor is not fought over spaces.
        markdown: "By grace.\n\n[[John 3:16]]\n",
        tags: [
          { slug: "grace", name: "Grace" },
          { slug: "hope", name: "hope" },
        ],
      },
    });
  });

  it("lets a reflection be empty and untitled: a draft just begun", () => {
    expect(validateContent({ title: "", markdown: "", tags: "" }, "reflection")).toEqual({
      ok: true,
      value: { title: null, markdown: "", tags: [] },
    });
  });

  it("says what is too long, and which tags are wrong", () => {
    const result = validateContent(
      {
        title: "t".repeat(MAX_ITEM_TITLE_LENGTH + 1),
        markdown: "m".repeat(MAX_MARKDOWN_LENGTH + 1),
        tags: "x".repeat(41),
      },
      "reflection",
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Keep the title to 200 characters; this one has 201.",
        markdown: "Keep a reflection to 100,000 characters; this has 100,001.",
        tags: "Keep each tag to 40 characters.",
      },
    });
  });

  it("gives a note no title, and wants it short and not empty", () => {
    expect(validateContent({ title: "Ignored", markdown: "Selah.", tags: "" }, "note")).toEqual({
      ok: true,
      value: { title: null, markdown: "Selah.", tags: [] },
    });
    expect(validateContent({ markdown: " \n ", tags: "" }, "note")).toEqual({
      ok: false,
      errors: { markdown: "Write the note first." },
    });
    expect(
      validateContent({ markdown: "n".repeat(MAX_NOTE_BODY_LENGTH + 1), tags: "" }, "note"),
    ).toEqual({
      ok: false,
      errors: { markdown: "Keep a note to 2,000 characters; this has 2,001." },
    });
  });
});

describe("validateNotePost", () => {
  const note = { markdown: "Selah.", tags: "psalms", visibility: "public" };

  it("anchors a note to the verses selected in the reader", () => {
    expect(
      validateNotePost({ ...note, v: "psalm-46.10-11", translationId: "web" }, translations),
    ).toEqual({
      ok: true,
      value: {
        title: null,
        markdown: "Selah.",
        tags: [{ slug: "psalms", name: "psalms" }],
        visibility: "public",
        passages: [{ start: 19046010, end: 19046011 }],
        translationId: "web",
      },
    });
  });

  it("posts a note on no passage", () => {
    const result = validateNotePost({ ...note, v: "", visibility: "unlisted" }, translations);
    expect(result).toMatchObject({
      ok: true,
      value: { passages: [], translationId: null, visibility: "unlisted" },
    });
  });

  it("is private unless it is told a visibility it knows", () => {
    for (const visibility of ["", "everyone", "PUBLIC"]) {
      expect(validateNotePost({ ...note, visibility }, translations)).toMatchObject({
        ok: true,
        value: { visibility: "private" },
      });
    }
  });

  it("refuses verses it cannot read rather than posting the note on nothing", () => {
    expect(validateNotePost({ ...note, v: "john-99.1" }, translations)).toEqual({
      ok: false,
      errors: { passage: "Those verses could not be read; select them again." },
    });
    expect(validateNotePost({ ...note, markdown: "", v: "john-99.1" }, translations)).toMatchObject({
      ok: false,
      errors: { markdown: "Write the note first.", passage: expect.any(String) },
    });
  });
});
