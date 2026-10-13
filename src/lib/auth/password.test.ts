import { describe, expect, it } from "vitest";

import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with Argon2id and never keeps the password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("correct horse");
  });

  it("salts: the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stapl")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("rejects when there is no user, without throwing", async () => {
    expect(await verifyPassword(undefined, "anything at all")).toBe(false);
  });

  it("rejects a stored value that is not a hash", async () => {
    expect(await verifyPassword("plaintext", "plaintext")).toBe(false);
  });

  it("rejects an over-long password without hashing it", async () => {
    const long = "x".repeat(MAX_PASSWORD_LENGTH + 1);
    expect(await verifyPassword(await hashPassword("short enough"), long)).toBe(false);
  });
});
