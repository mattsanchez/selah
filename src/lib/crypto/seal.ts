import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Authenticated encryption (AES-256-GCM) for small secrets kept in the
// database. A sealed value is "v1.<iv>.<tag>.<ciphertext>", base64url.

const VERSION = "v1";

export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

// Returns undefined when the value was sealed with another key or has been
// altered, so a lost secret reads as "no value saved" and not as a crash.
export function unseal(sealed: string, key: Buffer): string | undefined {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}
