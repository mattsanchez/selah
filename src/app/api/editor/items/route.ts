import type { NextRequest } from "next/server";

import { getDb } from "@/db/client";
import { listTranslations } from "@/lib/bible/passage";
import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference } from "@/lib/bible/reference";
import type { ContentData } from "@/lib/editor/types";
import { markdownExcerpt } from "@/lib/items/markdown";
import { highlightColor } from "@/lib/items/palette";
import { listItems, listTags } from "@/lib/items/queries";
import { tagSlug } from "@/lib/items/tags";

import { ownerOr401 } from "../owner";

export const dynamic = "force-dynamic";

const PAGE = 20;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// The owner's highlights, reflections and notes for the sidebar's "My
// content", newest first:
//
//   /api/editor/items?q=vine&tag=abiding&passage=john+15&offset=20&except=<id>
export async function GET(request: NextRequest) {
  const owner = await ownerOr401();
  if (owner instanceof Response) return owner;

  const params = request.nextUrl.searchParams;
  const passage = params.get("passage")?.trim();
  const parsed = passage ? parseReference(passage) : undefined;
  if (parsed && !parsed.ok) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  const except = params.get("except") ?? "";
  const db = getDb();
  const [translations, tags, results] = await Promise.all([
    listTranslations(db),
    listTags(db, owner.id),
    listItems(
      db,
      {
        ownerId: owner.id,
        text: params.get("q")?.slice(0, 200),
        tag: params.get("tag") ? tagSlug(params.get("tag")!) : undefined,
        ranges: parsed?.ok ? normalizeRanges(parsed.ranges) : undefined,
        except: UUID.test(except) ? except : undefined,
      },
      { limit: PAGE, offset: Math.max(0, Math.min(Number(params.get("offset")) || 0, 100_000)) },
    ),
  ]);

  const data: ContentData = {
    total: results.total,
    tags: tags.map(({ slug, name }) => ({ slug, name })),
    items: results.items.map((item) => {
      const readIn = item.passages.find((range) => range.translationId)?.translationId;
      return {
        id: item.id,
        kind: item.kind,
        visibility: item.visibility,
        createdAt: item.createdAt.toISOString(),
        title: item.title,
        excerpt: item.markdown
          ? markdownExcerpt(item.markdown.replace(/^\[\[.*\]\][ \t]*$/gm, ""), 140)
          : "",
        color: highlightColor(item.color)?.id ?? null,
        note: item.note,
        reference: item.passages.length > 0 ? formatReference(item.passages) : null,
        translation: translations.find((each) => each.id === readIn)?.abbrev ?? null,
        tags: item.tags,
      };
    }),
  };
  return Response.json(data);
}
