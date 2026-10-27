import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { loadPassage } from "@/lib/editor/passage-data";
import { getDefaultTranslationId } from "@/lib/site";

import { ownerOr401 } from "../owner";

export const dynamic = "force-dynamic";

// A passage for the editor (src/lib/editor/types.ts, PassageData):
//
//   /api/editor/passage?ref=John+3:16-18&t=kjv           as a card quotes it
//   /api/editor/passage?ref=John+3&t=kjv&for=reading     the whole passage, to read
export async function GET(request: NextRequest) {
  const owner = await ownerOr401();
  if (owner instanceof Response) return owner;

  const params = request.nextUrl.searchParams;
  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const data = await loadPassage(
    db,
    {
      reference: (params.get("ref") ?? "").slice(0, 200),
      translation: params.get("t"),
      for: params.get("for") === "reading" ? "reading" : "card",
    },
    { translations, defaultId },
  );
  return Response.json(data);
}
