import { hash, verify } from "@node-rs/argon2";

// Passwords are hashed with Argon2id at the parameters OWASP recommends
// (19 MiB of memory, 2 passes, 1 lane). The result is a PHC string that
// carries its own salt and parameters, so the parameters can be raised later
// without breaking existing hashes.
const OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;
// Long enough for any passphrase; a cap keeps a huge input from tying up the hasher.
export const MAX_PASSWORD_LENGTH = 200;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

// A hash of nothing anyone can type, verified against when there is no such
// user, so a wrong email takes as long to reject as a wrong password.
let decoy: Promise<string> | undefined;

export async function verifyPassword(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    if (passwordHash === undefined) {
      decoy ??= hashPassword(crypto.randomUUID());
      await verify(await decoy, password);
      return false;
    }
    return await verify(passwordHash, password);
  } catch {
    // Not a hash this function understands.
    return false;
  }
}
