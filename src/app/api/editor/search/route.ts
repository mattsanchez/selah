import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { searchVerses } from "@/lib/bible/search";
import { formatVerseId } from "@/lib/bible/verse-id";
import type { SearchData } from "@/lib/editor/types";
import { getDefaultTranslationId } from "@/lib/site";

import { ownerOr401 } from "../owner";

export const dynamic = "force-dynamic";

const PAGE = 20;

// Keyword search for the study sidebar, in one translation:
//
//   /api/editor/search?q=living+water&t=web&offset=20
export async function GET(request: NextRequest) {
  const owner = await ownerOr401();
  if (owner instanceof Response) return owner;

  const params = request.nextUrl.searchParams;
  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const translation = translations.find((each) => each.id === params.get("t")) ?? translations[0];
  const offset = Math.max(0, Math.min(Number(params.get("offset")) || 0, 10_000));
  const results = translation
    ? await searchVerses(db, {
        query: params.get("q") ?? "",
        translationIds: [translation.id],
        limit: PAGE,
        offset,
      })
    : { hits: [], total: 0, searchable: false };
  const data: SearchData = {
    total: results.total,
    searchable: results.searchable,
    hits: results.hits.map((hit) => ({
      verseId: hit.verseId,
      reference: formatVerseId(hit.verseId),
      translationId: hit.translationId,
      text: hit.text,
    })),
  };
  return Response.json(data);
}
