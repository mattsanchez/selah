import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { loadAiProvider } from "@/lib/ai/load";
import { listTranslations } from "@/lib/bible/passage";
import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference } from "@/lib/bible/reference";
import { translationInfo } from "@/lib/editor/passage-data";
import type { RelatedData } from "@/lib/editor/types";
import { relatedPassages } from "@/lib/embeddings/related";
import { findTranslation } from "@/lib/items/cards";
import { getDefaultTranslationId } from "@/lib/site";

import { ownerOr401 } from "../owner";

export const dynamic = "force-dynamic";

// Passages related to one, for the study sidebar's "Related":
//
//   /api/editor/related?ref=john+14:27&t=web
export async function GET(request: NextRequest) {
  const owner = await ownerOr401();
  if (owner instanceof Response) return owner;

  const params = request.nextUrl.searchParams;
  const parsed = parseReference(params.get("ref")?.trim() ?? "");
  if (!parsed.ok) return Response.json({ error: parsed.error.message }, { status: 400 });

  const db = getDb();
  const translations = await listTranslations(db, await getDefaultTranslationId());
  const translation = findTranslation(params.get("t") ?? undefined, translations) ?? translations[0];
  if (!translation) return Response.json({ error: "No translations are loaded." }, { status: 404 });

  const ranges = normalizeRanges(parsed.ranges);
  const related = await relatedPassages(
    db,
    { start: ranges[0].start, end: ranges.at(-1)!.end },
    { translationId: translation.id, provider: await loadAiProvider() },
  );
  const data: RelatedData = {
    ...related,
    reference: formatReference(ranges),
    translation: translationInfo(translation),
  };
  return Response.json(data);
}
