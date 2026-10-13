import { describe, expect, it } from "vitest";

import { parseReference } from "@/lib/bible/reference";

import {
  MAX_TRANSLATIONS,
  readerPath,
  selectTranslations,
  translationParam,
} from "./reader-url";

const available = ["bsb", "kjv", "web", "asv", "ylt"];

describe("selectTranslations", () => {
  it("shows the default translation when none is asked for", () => {
    expect(selectTranslations(undefined, available, "bsb")).toEqual(["bsb"]);
    expect(selectTranslations("", available, "web")).toEqual(["web"]);
    expect(selectTranslations("niv,esv", available, "bsb")).toEqual(["bsb"]);
  });

  it("keeps the order asked for, ignoring case, unknown ids and repeats", () => {
    expect(selectTranslations("web,bsb", available, "bsb")).toEqual(["web", "bsb"]);
    expect(selectTranslations("WEB, niv ,kjv,web", available, "bsb")).toEqual(["web", "kjv"]);
  });

  it(`shows at most ${MAX_TRANSLATIONS}`, () => {
    expect(selectTranslations("bsb,kjv,web,asv,ylt", available, "bsb")).toEqual([
      "bsb",
      "kjv",
      "web",
      "asv",
    ]);
  });

  it("falls back to any translation when the default is not loaded", () => {
    expect(selectTranslations(undefined, ["kjv", "web"], "bsb")).toEqual(["kjv"]);
    expect(selectTranslations("web", [], "bsb")).toEqual([]);
  });
});

describe("translationParam", () => {
  it("is absent for the default translation alone", () => {
    expect(translationParam(["bsb"], "bsb")).toBeUndefined();
    expect(translationParam([], "bsb")).toBeUndefined();
  });

  it("lists the translations otherwise", () => {
    expect(translationParam(["web"], "bsb")).toBe("web");
    expect(translationParam(["bsb", "web", "kjv"], "bsb")).toBe("bsb,web,kjv");
  });
});

describe("readerPath", () => {
  const ranges = (reference: string) => {
    const parsed = parseReference(reference);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.ranges;
  };

  it("is the passage's canonical URL", () => {
    expect(readerPath(ranges("jn3.16"))).toBe("/read/john-3.16");
    expect(readerPath(ranges("John 3:16-21"))).toBe("/read/john-3.16-21");
    expect(readerPath(ranges("Ps 23"))).toBe("/read/psalm-23");
    expect(readerPath(ranges("John 3:16-18, 22; 4:1-3"))).toBe("/read/john-3.16-18,22;4.1-3");
  });

  it("carries the translations", () => {
    expect(readerPath(ranges("Ps 23"), "bsb,web")).toBe("/read/psalm-23?t=bsb,web");
    expect(readerPath(ranges("Ps 23"), undefined)).toBe("/read/psalm-23");
  });

  it("carries the selected verses, and the source printed in full with them", () => {
    const v = ranges("John 3:16");
    expect(readerPath(ranges("John 3"), undefined, { v })).toBe("/read/john-3?v=john-3.16");
    expect(readerPath(ranges("John 3"), "bsb,web", { v })).toBe(
      "/read/john-3?t=bsb,web&v=john-3.16",
    );
    expect(readerPath(ranges("John 3"), undefined, { v, full: "matthew-henry" })).toBe(
      "/read/john-3?v=john-3.16&full=matthew-henry",
    );
    // Nothing is printed in full without a verse to study.
    expect(readerPath(ranges("John 3"), undefined, { v: [], full: "matthew-henry" })).toBe(
      "/read/john-3",
    );
  });
});
