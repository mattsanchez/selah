import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

// Crawlers may read the public site and the Bible; the owner's own pages are
// not for them (they ask for a sign-in anyway).
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/items", "/highlights", "/settings", "/sign-in", "/setup", "/write", "/api/"],
    },
    sitemap: `${await siteOrigin()}/sitemap.xml`,
  };
}
