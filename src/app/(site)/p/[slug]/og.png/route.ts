import { getDb } from "@/db/client";
import { getOwner } from "@/lib/auth/owner";
import { ogImage } from "@/lib/og/image";
import { itemOgCard, ogCacheControl, publicEntries, resolvePermalink } from "@/lib/public-feed";
import { decodeSegment } from "@/lib/public-url";
import { getSiteTitle } from "@/lib/site";

// An item's Open Graph image (src/lib/og/image.tsx), for whoever may see the
// item: see the permalink page beside it.
export async function GET(_request: Request, { params }: RouteContext<"/p/[slug]/og.png">) {
  const db = getDb();
  const owner = await getOwner().catch(() => null);
  const found = await resolvePermalink(db, decodeSegment((await params).slug), {
    ownerId: owner?.id,
  });
  if (!found) return new Response("Not found", { status: 404 });
  const [entry] = await publicEntries(db, [found.item]);
  return ogImage(itemOgCard(entry, await getSiteTitle()), {
    headers: { "cache-control": ogCacheControl(found.item.visibility) },
  });
}
