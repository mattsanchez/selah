import { describe, expect, it } from "vitest";

import {
  databaseUrl,
  DEFAULT_DATABASE_URL,
  emailConfig,
  magicLinkEnabled,
  publicUrl,
} from "./env";

describe("databaseUrl", () => {
  it("falls back to the compose database", () => {
    expect(databaseUrl({})).toBe(DEFAULT_DATABASE_URL);
    expect(databaseUrl({ DATABASE_URL: "" })).toBe(DEFAULT_DATABASE_URL);
  });

  it("uses DATABASE_URL when set", () => {
    const url = "postgres://u:p@db.example:5433/other";
    expect(databaseUrl({ DATABASE_URL: url })).toBe(url);
  });
});

describe("publicUrl", () => {
  it("is unset by default and reduced to an origin when set", () => {
    expect(publicUrl({})).toBeUndefined();
    expect(publicUrl({ SELAH_URL: " https://selah.example.org/ " })).toBe("https://selah.example.org");
  });

  it("rejects what is not an http(s) URL", () => {
    expect(() => publicUrl({ SELAH_URL: "selah.example.org" })).toThrow(/SELAH_URL/);
    expect(() => publicUrl({ SELAH_URL: "ftp://selah.example.org" })).toThrow(/http/);
  });
});

describe("emailConfig and magicLinkEnabled", () => {
  const smtp = { SMTP_URL: "smtp://user:pass@mail.example.org:587", EMAIL_FROM: "Selah <selah@example.org>" };

  it("has no email unless SMTP is configured", () => {
    expect(emailConfig({})).toBeUndefined();
    expect(emailConfig(smtp)).toEqual({ transport: "smtp", url: smtp.SMTP_URL, from: smtp.EMAIL_FROM });
    expect(() => emailConfig({ SMTP_URL: smtp.SMTP_URL })).toThrow(/EMAIL_FROM/);
    expect(() => emailConfig({ ...smtp, SMTP_URL: "mail.example.org" })).toThrow(/SMTP_URL/);
  });

  it("uses the stub transport when asked, for tests", () => {
    expect(emailConfig({ ...smtp, EMAIL_TRANSPORT: "stub" })).toMatchObject({ transport: "stub" });
  });

  it("offers magic links only with both email and a public URL", () => {
    expect(magicLinkEnabled({})).toBe(false);
    expect(magicLinkEnabled(smtp)).toBe(false);
    expect(magicLinkEnabled({ SELAH_URL: "https://selah.example.org" })).toBe(false);
    expect(magicLinkEnabled({ ...smtp, SELAH_URL: "https://selah.example.org" })).toBe(true);
  });
});
