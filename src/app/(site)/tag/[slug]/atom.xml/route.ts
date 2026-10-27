import { feedOrNotFound, tagScope } from "@/lib/public-feed";

// A tag's feed: its latest public items (src/lib/public-feed.ts).
export async function GET(_request: Request, { params }: RouteContext<"/tag/[slug]/atom.xml">) {
  return feedOrNotFound(await tagScope((await params).slug), "atom");
}
