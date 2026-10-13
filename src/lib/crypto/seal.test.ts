import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { seal, unseal } from "./seal";

const key = randomBytes(32);

describe("seal", () => {
  it("round-trips, and the sealed value does not contain the secret", () => {
    const sealed = seal("sk-ant-secret-value", key);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("sk-ant");
    expect(unseal(sealed, key)).toBe("sk-ant-secret-value");
  });

  it("seals the same value differently each time", () => {
    expect(seal("same", key)).not.toBe(seal("same", key));
  });

  it("returns undefined for another key, a changed value or junk", () => {
    const sealed = seal("secret", key);
    expect(unseal(sealed, randomBytes(32))).toBeUndefined();
    const [v, iv, tag, data] = sealed.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(unseal([v, iv, tag, flipped.toString("base64url")].join("."), key)).toBeUndefined();
    expect(unseal("not sealed", key)).toBeUndefined();
    expect(unseal("", key)).toBeUndefined();
  });
});
