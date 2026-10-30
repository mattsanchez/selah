import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { loadAiProvider } from "@/lib/ai/load";
import { listTranslations } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import { searchVerses } from "@/lib/bible/search";
import { embeddedTranslations } from "@/lib/embeddings/passages";
import type { SearchData } from "@/lib/editor/types";
import { parseScope, parseSearchMode, scopeRanges } from "@/lib/search-url";
import { getDefaultTranslationId } from "@/lib/site";

import { ownerOr401 } from "../owner";

export const dynamic = "force-dynamic";

const PAGE = 20;

// Search for the study sidebar, in one translation, by what `mode` and `in`
// ask for as on /search (src/lib/search-url.ts):
//
//   /api/editor/search?q=living+water&t=web&mode=keyword&in=john&offset=20
export async function GET(request: NextRequest) {
  const owner = await ownerOr401();
  if (owner instanceof Response) return owner;

  const params = request.nextUrl.searchParams;
  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const translation = translations.find((each) => each.id === params.get("t")) ?? translations[0];
  const offset = Math.max(0, Math.min(Number(params.get("offset")) || 0, 10_000));
  const provider = await loadAiProvider();
  const meaning = translation
    ? (await embeddedTranslations(db, provider.embeddingModel, [translation.id])).length > 0
    : false;
  const results = translation
    ? await searchVerses(db, {
        query: params.get("q") ?? "",
        translationIds: [translation.id],
        ranges: scopeRanges(parseScope(params.get("in") ?? undefined)),
        limit: PAGE,
        offset,
        mode: parseSearchMode(params.get("mode") ?? undefined, meaning),
        provider,
      })
    : { hits: [], total: 0, searchable: false };
  const data: SearchData = {
    total: results.total,
    searchable: results.searchable,
    mode: results.mode ?? "keyword",
    hits: results.hits.map((hit) => ({
      verseId: hit.verseId,
      endVerseId: hit.endVerseId,
      reference: formatReference([{ start: hit.verseId, end: hit.endVerseId ?? hit.verseId }]),
      translationId: hit.translationId,
      text: hit.text,
    })),
  };
  return Response.json(data);
}
