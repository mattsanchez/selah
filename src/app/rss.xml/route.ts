import { feed } from "@/lib/public-feed";

// The whole site's feed: the latest public items (src/lib/public-feed.ts).
export function GET() {
  return feed({ kind: "site" }, "rss");
}
