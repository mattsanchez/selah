import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  authSecret,
  clearSetupToken,
  getSetupToken,
  settingsKey,
  verifySetupToken,
} from "./secrets";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "selah-secrets-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the install secret", () => {
  it("is generated once, kept in the data directory and readable only by its owner", () => {
    const env = { SELAH_DATA_DIR: dir };
    const first = authSecret(env);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(authSecret(env)).toBe(first);
    expect(statSync(path.join(dir, "secret")).mode & 0o777).toBe(0o600);
    // What is on disk is the master secret, not the derived keys.
    expect(readFileSync(path.join(dir, "secret"), "utf8")).not.toContain(first);
  });

  it("differs between installs and between uses", () => {
    const other = mkdtempSync(path.join(tmpdir(), "selah-secrets-"));
    try {
      expect(authSecret({ SELAH_DATA_DIR: dir })).not.toBe(authSecret({ SELAH_DATA_DIR: other }));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
    const env = { SELAH_DATA_DIR: dir };
    expect(settingsKey(env)).toHaveLength(32);
    expect(settingsKey(env).toString("base64url")).not.toBe(authSecret(env));
  });

  it("comes from SELAH_SECRET when set, and must be long enough", () => {
    const env = { SELAH_DATA_DIR: dir, SELAH_SECRET: "s".repeat(32) };
    expect(authSecret(env)).toBe(authSecret({ ...env, SELAH_DATA_DIR: "/nowhere" }));
    expect(() => authSecret({ SELAH_SECRET: "too short" })).toThrow(/at least 32/);
  });
});

describe("the setup token", () => {
  it("is generated once, verified, and gone after setup", () => {
    const env = { SELAH_DATA_DIR: dir };
    const token = getSetupToken(env);
    expect(token).toMatch(/^[\w-]{24}$/);
    expect(getSetupToken(env)).toBe(token);
    expect(verifySetupToken(` ${token} `, env)).toBe(true);
    expect(verifySetupToken("", env)).toBe(false);
    expect(verifySetupToken(`${token}x`, env)).toBe(false);

    clearSetupToken(env);
    expect(getSetupToken(env)).not.toBe(token);
  });

  it("comes from SELAH_SETUP_TOKEN when set", () => {
    const env = { SELAH_DATA_DIR: dir, SELAH_SETUP_TOKEN: "chosen-by-the-operator" };
    expect(verifySetupToken("chosen-by-the-operator", env)).toBe(true);
    expect(verifySetupToken("something else", env)).toBe(false);
  });
});
