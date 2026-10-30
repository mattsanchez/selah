import { getDb } from "@/db/client";
import { loadAiProvider } from "@/lib/ai/load";
import type { AiProvider } from "@/lib/ai/types";
import { getOwner } from "@/lib/auth/owner";
import { listTranslations, type Translation } from "@/lib/bible/passage";
import { normalizeRanges } from "@/lib/bible/ranges";
import { parseReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { findTranslation } from "@/lib/items/cards";
import { translationParam } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";

// Ask is the owner's alone: a question spends the owner's key, and the site's
// public pages are for visitors. Every Ask route starts here, so that holds
// on every call, whatever a page shows. With no provider that can answer
// there is no Ask, and a call says so without saying why.
export async function askAccess(): Promise<{ provider: AiProvider; model: string } | Response> {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "Sign in to use Ask." }, { status: 401 });
  const provider = await loadAiProvider();
  if (!provider.answerModel) return Response.json({ error: "Ask is off on this install." }, { status: 404 });
  return { provider, model: provider.answerModel };
}

export type AskPassage = { ranges: VerseRange[]; translation: Translation; t?: string };

// A passage and translation as a request names them, or what is wrong.
export async function askPassage(reference: string, name: string | undefined): Promise<AskPassage | Response> {
  const parsed = parseReference(reference.trim());
  if (!parsed.ok) return Response.json({ error: parsed.error.message }, { status: 400 });
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(getDb(), defaultId);
  const translation = findTranslation(name, translations) ?? translations[0];
  if (!translation) return Response.json({ error: "No translations are loaded." }, { status: 404 });
  return {
    ranges: normalizeRanges(parsed.ranges),
    translation,
    t: translationParam([translation.id], defaultId),
  };
}
