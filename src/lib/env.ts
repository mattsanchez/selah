// Matches the `db` service in docker-compose.yml, so a fresh clone needs no .env file.
export const DEFAULT_DATABASE_URL =
  "postgres://selah:selah@127.0.0.1:5432/selah";

type Env = Record<string, string | undefined>;

export function databaseUrl(env: Env = process.env): string {
  return env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

// Where Selah keeps the files it creates at first boot (the generated secret,
// the setup token) and the downloaded Bible sources. A volume in Docker.
export function dataDir(env: Env = process.env): string {
  return env.SELAH_DATA_DIR?.trim() || ".data";
}

// The address people reach the site at, e.g. "https://selah.example.org",
// without a trailing slash. Unset means "whatever host the request came to".
export function publicUrl(env: Env = process.env): string | undefined {
  const value = env.SELAH_URL?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SELAH_URL is not a URL: "${value}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SELAH_URL must start with http:// or https://: "${value}"`);
  }
  return url.origin;
}

export type EmailConfig =
  // Sends through an SMTP server.
  | { transport: "smtp"; url: string; from: string }
  // Sends nothing: writes each message to a file. For tests.
  | { transport: "stub"; from: string };

// Email is configured by SMTP_URL (and EMAIL_FROM), or stubbed for tests with
// EMAIL_TRANSPORT=stub. Undefined means the install cannot send email.
export function emailConfig(env: Env = process.env): EmailConfig | undefined {
  const from = env.EMAIL_FROM?.trim();
  if (env.EMAIL_TRANSPORT?.trim().toLowerCase() === "stub") {
    return { transport: "stub", from: from || "Selah <selah@localhost>" };
  }
  const url = env.SMTP_URL?.trim();
  if (!url) return undefined;
  if (!/^smtps?:\/\//i.test(url)) {
    throw new Error("SMTP_URL must look like smtp://user:password@host:587 or smtps://…");
  }
  if (!from) throw new Error("EMAIL_FROM is required when SMTP_URL is set.");
  return { transport: "smtp", url, from };
}

// Magic-link sign-in needs a way to send email and a fixed public address:
// the link in the email must never be built from a request's Host header.
export function magicLinkEnabled(env: Env = process.env): boolean {
  return emailConfig(env) !== undefined && publicUrl(env) !== undefined;
}
