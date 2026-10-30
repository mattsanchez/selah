import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

// Validation of what the setup and settings forms submit. Pure functions: the
// forms' server actions call them, and so do the unit tests.

export type Errors<Field extends string> = Partial<Record<Field, string>>;
export type Result<Value, Field extends string> =
  | { ok: true; value: Value }
  | { ok: false; errors: Errors<Field> };

export const MAX_TITLE_LENGTH = 80;
export const MAX_API_KEY_LENGTH = 400;

// Emails are compared and stored in lowercase.
export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

export function emailError(email: string): string | undefined {
  if (!email) return "Enter your email address.";
  // One "@", something on each side, a dot in the domain, no spaces or quotes.
  if (email.length > 254 || !/^[^\s@"<>,;]+@[^\s@"<>,;]+\.[^\s@"<>,;.]+$/.test(email)) {
    return "Enter an email address, like you@example.org.";
  }
}

export function passwordError(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
}

// "@Matt" and "matt" are the same handle.
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function handleError(handle: string): string | undefined {
  if (!handle) return "Choose a handle, like matt.";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/.test(handle) || handle.includes("--")) {
    return "Use 1 to 30 lowercase letters, digits or single hyphens, starting and ending with a letter or digit.";
  }
}

export function titleError(title: string): string | undefined {
  if (!title) return "Give the site a title.";
  if (title.length > MAX_TITLE_LENGTH) return `Use at most ${MAX_TITLE_LENGTH} characters.`;
}

export function apiKeyError(key: string): string | undefined {
  // Keys are printable ASCII with no spaces; anything else is a paste gone wrong.
  if (key.length > MAX_API_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(key)) {
    return "That does not look like an API key. Paste the key alone, with no spaces.";
  }
}

export const MAX_DAILY_CAP = 10_000;

// A daily cap on questions as typed, or what is wrong with it.
export function parseDailyCap(typed: string): { cap: number } | { error: string } {
  const cap = Number(typed.trim());
  if (!typed.trim() || !Number.isInteger(cap) || cap < 1 || cap > MAX_DAILY_CAP) {
    return { error: `Enter a whole number from 1 to ${MAX_DAILY_CAP.toLocaleString("en")}.` };
  }
  return { cap };
}

export type SiteInput = {
  title: string;
  handle: string;
  defaultTranslationId: string;
  // Empty means "none given": on the settings form, leave the saved key alone.
  anthropicApiKey: string;
  voyageApiKey: string;
};
export type SiteValues = {
  title: string;
  handle: string;
  defaultTranslationId: string;
  anthropicApiKey?: string;
  voyageApiKey?: string;
};
export type SiteField = keyof SiteInput;

// `translationIds` are the translations loaded in this install; the default
// must be one of them.
export function validateSite(
  input: SiteInput,
  translationIds: readonly string[],
): Result<SiteValues, SiteField> {
  const title = input.title.trim().replace(/\s+/g, " ");
  const handle = normalizeHandle(input.handle);
  const anthropicApiKey = input.anthropicApiKey.trim();
  const voyageApiKey = input.voyageApiKey.trim();

  const errors: Errors<SiteField> = {};
  const check = (field: SiteField, error: string | undefined) => {
    if (error) errors[field] = error;
  };
  check("title", titleError(title));
  check("handle", handleError(handle));
  check(
    "defaultTranslationId",
    translationIds.includes(input.defaultTranslationId)
      ? undefined
      : "Choose one of the translations that are loaded.",
  );
  if (anthropicApiKey) check("anthropicApiKey", apiKeyError(anthropicApiKey));
  if (voyageApiKey) check("voyageApiKey", apiKeyError(voyageApiKey));
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      handle,
      defaultTranslationId: input.defaultTranslationId,
      ...(anthropicApiKey && { anthropicApiKey }),
      ...(voyageApiKey && { voyageApiKey }),
    },
  };
}

export type SetupInput = SiteInput & { email: string; password: string };
export type SetupValues = SiteValues & { email: string; password: string };
export type SetupField = keyof SetupInput;

export function validateSetup(
  input: SetupInput,
  translationIds: readonly string[],
): Result<SetupValues, SetupField> {
  const email = normalizeEmail(input.email);
  const errors: Errors<SetupField> = {};
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  const passwordProblem = passwordError(input.password);
  if (passwordProblem) errors.password = passwordProblem;

  const site = validateSite(input, translationIds);
  if (!site.ok) Object.assign(errors, site.errors);
  if (!site.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...site.value, email, password: input.password } };
}
