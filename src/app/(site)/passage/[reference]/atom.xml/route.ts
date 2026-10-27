import { feedOrNotFound, passageScope } from "@/lib/public-feed";

// A passage's feed: the latest public items on verses that overlap it
// (src/lib/public-feed.ts).
export async function GET(
  _request: Request,
  { params }: RouteContext<"/passage/[reference]/atom.xml">,
) {
  return feedOrNotFound(passageScope((await params).reference), "atom");
}
