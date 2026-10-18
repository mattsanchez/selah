import { describe, expect, it } from "vitest";

import { MAX_ITEM_TAGS, MAX_TAG_LENGTH, formatTags, normalizeTag, parseTags, tagSlug } from "./tags";

describe("tagSlug", () => {
  it("is the name in lower case, without accents, hyphenated", () => {
    expect(tagSlug("Holy Spirit")).toBe("holy-spirit");
    expect(tagSlug("  Grace & Truth!  ")).toBe("grace-truth");
    expect(tagSlug("Café")).toBe("cafe");
    expect(tagSlug("Romans 8")).toBe("romans-8");
    expect(tagSlug("--a__b--")).toBe("a-b");
  });

  it("keeps letters of any script", () => {
    expect(tagSlug("Ἀγάπη")).toBe("αγαπη");
    expect(tagSlug("חסד")).toBe("חסד");
  });

  it("is empty when there is nothing to keep", () => {
    expect(tagSlug("!!!")).toBe("");
    expect(tagSlug("")).toBe("");
  });
});

describe("normalizeTag", () => {
  it("keeps the name as typed, less a leading # and spare spaces", () => {
    expect(normalizeTag("  #Holy   Spirit ")).toEqual({ slug: "holy-spirit", name: "Holy Spirit" });
    expect(normalizeTag("grace")).toEqual({ slug: "grace", name: "grace" });
  });

  it("is nothing for a tag with no letters or digits", () => {
    expect(normalizeTag("#")).toBeUndefined();
    expect(normalizeTag(" - ")).toBeUndefined();
  });
});

describe("parseTags", () => {
  it("reads tags separated by commas, each once, in the order typed", () => {
    expect(parseTags("grace, Holy Spirit,, #Romans , GRACE,")).toEqual({
      ok: true,
      tags: [
        { slug: "grace", name: "grace" },
        { slug: "holy-spirit", name: "Holy Spirit" },
        { slug: "romans", name: "Romans" },
      ],
    });
    expect(parseTags("")).toEqual({ ok: true, tags: [] });
  });

  it("refuses a tag that is too long, and too many tags", () => {
    expect(parseTags("x".repeat(MAX_TAG_LENGTH))).toMatchObject({ ok: true });
    expect(parseTags("x".repeat(MAX_TAG_LENGTH + 1))).toEqual({
      ok: false,
      error: "Keep each tag to 40 characters.",
    });
    const many = Array.from({ length: MAX_ITEM_TAGS + 1 }, (_, i) => `tag${i}`).join(",");
    expect(parseTags(many)).toEqual({
      ok: false,
      error: "An item can have up to 10 tags; this has 11.",
    });
  });

  it("round-trips through the form's field", () => {
    const typed = "grace, Holy Spirit";
    const parsed = parseTags(typed);
    expect(parsed.ok && formatTags(parsed.tags)).toBe(typed);
  });
});
