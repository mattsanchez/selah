import { describe, expect, it } from "vitest";

import {
  MAX_DAILY_CAP,
  emailError,
  handleError,
  normalizeEmail,
  normalizeHandle,
  parseDailyCap,
  passwordError,
  validateSetup,
  validateSite,
  type SetupInput,
} from "./validate";

const LOADED = ["bsb", "web", "kjv"];
const site = {
  title: "Morning pages",
  handle: "matt",
  defaultTranslationId: "web",
  anthropicApiKey: "",
  voyageApiKey: "",
};
const setup: SetupInput = { ...site, email: "Matt@Example.org ", password: "ten chars!" };

describe("validateSite", () => {
  it("accepts good values and tidies them", () => {
    expect(validateSite({ ...site, title: "  Morning   pages ", handle: " @Matt " }, LOADED)).toEqual({
      ok: true,
      value: { title: "Morning pages", handle: "matt", defaultTranslationId: "web" },
    });
  });

  it("requires a title of at most 80 characters", () => {
    expect(validateSite({ ...site, title: "   " }, LOADED)).toMatchObject({
      ok: false,
      errors: { title: "Give the site a title." },
    });
    expect(validateSite({ ...site, title: "x".repeat(81) }, LOADED).ok).toBe(false);
    expect(validateSite({ ...site, title: "x".repeat(80) }, LOADED).ok).toBe(true);
  });

  it.each(["", "-matt", "matt-", "ma--tt", "matt sanchez", "matt_s", "mätt", "a".repeat(31), "../x"])(
    "rejects the handle %j",
    (handle) => {
      const result = validateSite({ ...site, handle }, LOADED);
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("errors.handle");
    },
  );

  it.each(["m", "matt", "matt-sanchez", "m4tt", "a".repeat(30)])("accepts the handle %j", (handle) => {
    expect(handleError(normalizeHandle(handle))).toBeUndefined();
  });

  it("only accepts a default translation that is loaded", () => {
    expect(validateSite({ ...site, defaultTranslationId: "esv" }, LOADED)).toMatchObject({
      ok: false,
      errors: { defaultTranslationId: "Choose one of the translations that are loaded." },
    });
    expect(validateSite({ ...site, defaultTranslationId: "" }, LOADED).ok).toBe(false);
    expect(validateSite(site, []).ok).toBe(false);
  });

  it("keeps API keys only when given, and rejects ones that cannot be keys", () => {
    const withKeys = validateSite(
      { ...site, anthropicApiKey: " sk-ant-abc123 ", voyageApiKey: "" },
      LOADED,
    );
    expect(withKeys).toMatchObject({ ok: true, value: { anthropicApiKey: "sk-ant-abc123" } });
    expect(withKeys.ok && "voyageApiKey" in withKeys.value).toBe(false);

    for (const bad of ["two words", "line\nbreak", "x".repeat(401), "clé-secrète"]) {
      expect(validateSite({ ...site, voyageApiKey: bad }, LOADED)).toHaveProperty(
        "errors.voyageApiKey",
      );
    }
  });

  it("reports every problem at once", () => {
    const result = validateSite({ ...site, title: "", handle: "!", defaultTranslationId: "x" }, LOADED);
    expect(result.ok || Object.keys(result.errors).sort()).toEqual([
      "defaultTranslationId",
      "handle",
      "title",
    ]);
  });
});

describe("validateSetup", () => {
  it("accepts good values, lowercasing the email and keeping the password as typed", () => {
    expect(validateSetup({ ...setup, password: "  Spaces kept  " }, LOADED)).toEqual({
      ok: true,
      value: {
        email: "matt@example.org",
        password: "  Spaces kept  ",
        title: "Morning pages",
        handle: "matt",
        defaultTranslationId: "web",
      },
    });
  });

  it.each(["", "matt", "matt@", "@example.org", "matt@example", "a b@example.org", "a@b@c.org", '"a"@b.org'])(
    "rejects the email %j",
    (email) => {
      expect(emailError(normalizeEmail(email))).toBeDefined();
    },
  );

  it("requires a password of 10 to 200 characters", () => {
    expect(passwordError("123456789")).toBe("Use at least 10 characters.");
    expect(passwordError("1234567890")).toBeUndefined();
    expect(passwordError("x".repeat(200))).toBeUndefined();
    expect(passwordError("x".repeat(201))).toBeDefined();
  });

  it("reports account and site problems together", () => {
    const result = validateSetup({ ...setup, email: "nope", password: "short", handle: "" }, LOADED);
    expect(result.ok || Object.keys(result.errors).sort()).toEqual(["email", "handle", "password"]);
  });
});

describe("parseDailyCap", () => {
  it("takes a whole number in range", () => {
    expect(parseDailyCap(" 25 ")).toEqual({ cap: 25 });
    expect(parseDailyCap("1")).toEqual({ cap: 1 });
    expect(parseDailyCap(String(MAX_DAILY_CAP))).toEqual({ cap: MAX_DAILY_CAP });
  });

  it("refuses anything else", () => {
    for (const typed of ["", "  ", "0", "-1", "1.5", "lots", String(MAX_DAILY_CAP + 1)]) {
      expect(parseDailyCap(typed)).toHaveProperty("error");
    }
  });
});
