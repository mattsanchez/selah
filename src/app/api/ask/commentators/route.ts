import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { commentatorCards } from "@/lib/ask/commentators";
import { formatReference } from "@/lib/bible/reference";

import { askAccess, askPassage } from "../access";

export const dynamic = "force-dynamic";

//   /api/ask/commentators?ref=john+14:27&t=web
export async function GET(request: NextRequest) {
  const access = await askAccess();
  if (access instanceof Response) return access;
  const params = request.nextUrl.searchParams;
  const passage = await askPassage(params.get("ref") ?? "", params.get("t") ?? undefined);
  if (passage instanceof Response) return passage;

  const { ranges, translation, t } = passage;
  const cards = await commentatorCards(getDb(), ranges, { translationId: translation.id, t });
  return Response.json({ reference: formatReference(ranges), cards });
}
