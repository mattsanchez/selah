import { describe, expect, it } from "vitest";

import {
  MAX_ITEM_PASSAGES,
  MAX_NOTE_LENGTH,
  normalizeNote,
  parsePassages,
  validateHighlightEdit,
  validateNewHighlight,
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
