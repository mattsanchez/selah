import { ogImage } from "@/lib/og/image";
import { SITE_DESCRIPTION } from "@/lib/public-feed";
import { getSiteTitle } from "@/lib/site";

// The front page's Open Graph image (src/lib/og/image.tsx).
export async function GET() {
  return ogImage(
    { kind: "page", title: await getSiteTitle(), subtitle: SITE_DESCRIPTION },
    { headers: { "cache-control": "public, max-age=600" } },
  );
}
