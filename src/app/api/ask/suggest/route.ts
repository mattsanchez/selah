import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { suggestPassages } from "@/lib/ask/suggest";
import { formatReference } from "@/lib/bible/reference";
import { translationInfo } from "@/lib/editor/passage-data";
import type { RelatedData } from "@/lib/editor/types";

import { askAccess, askPassage } from "../access";

export const dynamic = "force-dynamic";

//   /api/ask/suggest?ref=john+14:27&t=web
export async function GET(request: NextRequest) {
  const access = await askAccess();
  if (access instanceof Response) return access;
  const params = request.nextUrl.searchParams;
  const passage = await askPassage(params.get("ref") ?? "", params.get("t") ?? undefined);
  if (passage instanceof Response) return passage;

  const { ranges, translation } = passage;
  const related = await suggestPassages(getDb(), ranges, { translationId: translation.id, provider: access.provider });
  const data: RelatedData = {
    ...related,
    reference: formatReference(ranges),
    translation: translationInfo(translation),
  };
  return Response.json(data);
}
