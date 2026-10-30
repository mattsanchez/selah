"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { AI_KEY_NAMES, withAiKeys, type AiKeyName } from "@/lib/ai/keys";
import { loadAiProvider } from "@/lib/ai/load";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { runEmbeddingJob } from "@/lib/embeddings/job";
import { validateSite, type Errors, type SiteField } from "@/lib/settings/validate";
import { getSite, updateSite } from "@/lib/site";

export type SettingsState = {
  errors?: Errors<SiteField>;
  formError?: string;
  saved?: boolean;
  // What was typed, to refill the form after an error. Never the API keys.
  values?: Partial<Record<"title" | "handle" | "defaultTranslationId", string>>;
};

export async function saveSettingsAction(
  _: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  await requireOwner("/settings");

  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const input = {
    title: text("title"),
    handle: text("handle"),
    defaultTranslationId: text("defaultTranslationId"),
    anthropicApiKey: text("anthropicApiKey"),
    voyageApiKey: text("voyageApiKey"),
  };
  const values = {
    title: input.title,
    handle: input.handle,
    defaultTranslationId: input.defaultTranslationId,
  };

  const db = getDb();
  const current = await getSite();
  if (!current) return { formError: "This site has no settings yet. Run setup first." };

  const translations = await listTranslations(db);
  const valid = validateSite(
    input,
    translations.map((translation) => translation.id),
  );
  if (!valid.ok) return { values, errors: valid.errors };

  // For each key: a new value replaces the saved one, the "remove" box
  // deletes it, and otherwise it stays as it is.
  const typed: Record<AiKeyName, string | undefined> = {
    anthropic: valid.value.anthropicApiKey,
    voyage: valid.value.voyageApiKey,
  };
  const changes: Partial<Record<AiKeyName, string | null>> = {};
  for (const name of AI_KEY_NAMES) {
    if (typed[name]) changes[name] = typed[name];
    else if (form.get(`${name}Remove`) === "on") changes[name] = null;
  }

  await updateSite(db, {
    title: valid.value.title,
    handle: valid.value.handle,
    defaultTranslationId: valid.value.defaultTranslationId,
    settings: withAiKeys(current.settings, changes),
  });
  // The title is in every page's chrome, and the default translation decides
  // what the reader shows.
  revalidatePath("/", "layout");
  return { saved: true };
}

// "Start" or "Continue" in the settings' meaning search section. The run goes
// on in this server after the answer; the page follows it in `embedding_job`.
// Answers once the run has its row, so the page comes back showing it.
export async function startEmbeddingAction(): Promise<void> {
  await requireOwner("/settings");
  const provider = await loadAiProvider();
  if (!provider.embeddingModel) return;
  const site = await getSite();
  await new Promise<void>((resolve) => {
    void runEmbeddingJob(getDb(), provider, {
      defaultId: site?.defaultTranslationId,
      onClaimed: resolve,
    })
      .catch(() => {})
      .finally(resolve);
  });
  revalidatePath("/settings");
}
