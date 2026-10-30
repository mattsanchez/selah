import { getDb } from "@/db/client";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { ogImage } from "@/lib/og/image";
import { passageScope } from "@/lib/public-feed";
import { getDefaultTranslationId, getSiteTitle } from "@/lib/site";

// A passage page's Open Graph image (src/lib/og/image.tsx): the passage's
// first verses in the site's default translation.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/passage/[reference]/og.png">,
) {
  const scope = passageScope((await params).reference);
  if (scope?.kind !== "passage") return new Response("Not found", { status: 404 });
  const db = getDb();
  const [translation] = await listTranslations(db, await getDefaultTranslationId());
  // The start of the passage is all the image has room for.
  const opening = { start: scope.ranges[0].start, end: Math.min(scope.ranges[0].end, scope.ranges[0].start + 20) };
  const verses = translation
    ? ((await getPassages(db, [translation.id], [opening])).get(translation.id)?.[0] ?? [])
    : [];
  const text = verses.map((verse) => verse.text).join(" ");
  return ogImage(
    text
      ? {
          kind: "verse",
          label: "Passage",
          text,
          reference: scope.reference,
          translation: translation?.abbrev,
          site: await getSiteTitle(),
        }
      : { kind: "page", label: "Passage", title: scope.reference, site: await getSiteTitle() },
    { headers: { "cache-control": "public, max-age=600" } },
  );
}
