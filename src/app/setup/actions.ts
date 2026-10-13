"use server";

import { signIn } from "@/auth";
import { getDb } from "@/db/client";
import { withAiKeys } from "@/lib/ai/keys";
import { listTranslations } from "@/lib/bible/passage";
import { createOwner, ownerExists, ownerStore } from "@/lib/owner";
import { clearSetupToken, verifySetupToken } from "@/lib/secrets";
import { validateSetup, type Errors, type SetupField } from "@/lib/settings/validate";

export type SetupState = {
  // Problems with one field each, and one with the whole form.
  errors?: Errors<SetupField | "token">;
  formError?: string;
  // What was typed, to refill the form. Never the password or the API keys.
  values?: Partial<Record<"token" | "email" | "title" | "handle" | "defaultTranslationId", string>>;
};

const ALREADY_SET_UP = "This site is already set up. Sign in instead.";

// Creates the owner account and the site settings, once. Runs only while no
// owner exists and only with the setup token.
export async function setupAction(_: SetupState, form: FormData): Promise<SetupState> {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const input = {
    email: text("email"),
    password: text("password"),
    title: text("title"),
    handle: text("handle"),
    defaultTranslationId: text("defaultTranslationId"),
    anthropicApiKey: text("anthropicApiKey"),
    voyageApiKey: text("voyageApiKey"),
  };
  const token = text("token");
  const values = {
    token,
    email: input.email,
    title: input.title,
    handle: input.handle,
    defaultTranslationId: input.defaultTranslationId,
  };

  const db = getDb();
  if (await ownerExists(db)) return { formError: ALREADY_SET_UP };
  if (!token.trim() || !verifySetupToken(token)) {
    return {
      values,
      errors: {
        token:
          "That is not this install's setup token. It is printed in the server's logs " +
          "(with Docker: docker compose logs app).",
      },
    };
  }

  const translations = await listTranslations(db);
  const valid = validateSetup(
    input,
    translations.map((translation) => translation.id),
  );
  if (!valid.ok) return { values, errors: valid.errors };
  const { email, password, title, handle, defaultTranslationId } = valid.value;

  const result = await createOwner(ownerStore(db), {
    email,
    password,
    site: {
      title,
      handle,
      defaultTranslationId,
      settings: withAiKeys(
        {},
        { anthropic: valid.value.anthropicApiKey, voyage: valid.value.voyageApiKey },
      ),
    },
  });
  if (result === "owner-exists") return { formError: ALREADY_SET_UP };
  clearSetupToken();

  // Signs the new owner in and redirects to the reader.
  await signIn("credentials", { email, password, redirectTo: "/read" });
  return {};
}
