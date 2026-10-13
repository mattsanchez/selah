import { createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dataDir } from "./env";

// Secrets Selah needs but must never ship with: they come from the
// environment, or are created at first boot and kept in the data directory
// (mode 0600), outside the database, so a database dump alone can neither
// forge a session nor decrypt the saved AI keys.

type Env = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;

function readOrCreate(file: string, create: () => string): string {
  const read = () => readFileSync(file, "utf8").trim();
  try {
    const existing = read();
    if (existing) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const value = create();
  try {
    // "wx": the app and the first-boot process may both get here; one wins.
    writeFileSync(file, `${value}\n`, { flag: "wx", mode: 0o600 });
    chmodSync(file, 0o600);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return read();
  }
}

let cachedMaster: { key: string; value: string } | undefined;

// The install's master secret: SELAH_SECRET, or a random one generated on
// first use and stored in the data directory.
function masterSecret(env: Env): string {
  const fromEnv = env.SELAH_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `SELAH_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
          "Generate one with `openssl rand -base64 32`, or unset it to have one generated.",
      );
    }
    return fromEnv;
  }
  const file = path.join(dataDir(env), "secret");
  if (cachedMaster?.key !== file) {
    cachedMaster = {
      key: file,
      value: readOrCreate(file, () => randomBytes(32).toString("base64url")),
    };
  }
  return cachedMaster.value;
}

// Each use gets its own key, derived from the master secret, so the session
// secret and the settings encryption key are unrelated to each other.
function derive(purpose: string, env: Env): Buffer {
  return Buffer.from(hkdfSync("sha256", masterSecret(env), "selah", purpose, 32));
}

// Signs and encrypts session cookies (Auth.js).
export function authSecret(env: Env = process.env): string {
  return derive("auth", env).toString("base64url");
}

// Encrypts settings that must not be readable in the database (src/lib/crypto/seal.ts).
export function settingsKey(env: Env = process.env): Buffer {
  return derive("settings", env);
}

const setupTokenFile = (env: Env) => path.join(dataDir(env), "setup-token");

// The token the setup screen asks for while no owner exists: whoever reaches
// a fresh install first cannot claim it without also seeing the server's logs
// (or its data directory). SELAH_SETUP_TOKEN, or generated on first use.
export function getSetupToken(env: Env = process.env): string {
  const fromEnv = env.SELAH_SETUP_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readOrCreate(setupTokenFile(env), () => randomBytes(18).toString("base64url"));
}

export function verifySetupToken(candidate: string, env: Env = process.env): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  // Compared as digests so the comparison takes the same time whatever was typed.
  return timingSafeEqual(digest(candidate.trim()), digest(getSetupToken(env)));
}

// Called once the owner exists; the token has no further use.
export function clearSetupToken(env: Env = process.env): void {
  rmSync(setupTokenFile(env), { force: true });
}
