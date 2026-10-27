import { ogImage } from "@/lib/og/image";
import { tagScope } from "@/lib/public-feed";
import { getSiteTitle } from "@/lib/site";

// A tag page's Open Graph image (src/lib/og/image.tsx).
export async function GET(_request: Request, { params }: RouteContext<"/tag/[slug]/og.png">) {
  const scope = await tagScope((await params).slug);
  if (scope?.kind !== "tag") return new Response("Not found", { status: 404 });
  return ogImage(
    { kind: "page", label: "Tag", title: `#${scope.name}`, site: await getSiteTitle() },
    { headers: { "cache-control": "public, max-age=600" } },
  );
}
