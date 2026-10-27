import type { Metadata } from "next";

import { feedPath } from "@/lib/public-url";
import { getSiteTitle } from "@/lib/site";
import { siteOrigin } from "@/lib/site-origin";

// The metadata every public page carries: its canonical address, its feeds,
// and Open Graph and Twitter cards with an image (an og.png beside the page,
// drawn by src/lib/og-image.tsx). Relative URLs here are made absolute
// against the site's origin.

export type PublicPage = {
  // The page's own title; the site's title is added after it.
  title?: string;
  description: string;
  // The canonical path: "/", "/p/...", "/tag/grace".
  path: string;
  image: string;
  // The image's text, for those who cannot see it.
  imageAlt: string;
  type?: "website" | "article";
  publishedTime?: Date;
  modifiedTime?: Date;
  tags?: readonly string[];
  // Feeds of what the page lists, besides the site's own.
  feedOf?: string;
  // Kept out of search engines: an unlisted or a private item.
  noindex?: boolean;
};

export async function publicMetadata(page: PublicPage): Promise<Metadata> {
  const [origin, siteTitle] = await Promise.all([siteOrigin(), getSiteTitle()]);
  const fullTitle = page.title ? `${page.title} · ${siteTitle}` : siteTitle;
  const feeds = [
    ...(page.feedOf ? [{ of: page.feedOf, name: fullTitle }] : []),
    { of: "/", name: siteTitle },
  ];
  const links = (format: "rss" | "atom") =>
    feeds.map(({ of, name }) => ({ url: feedPath(format, of), title: name }));
  const image = { url: page.image, width: 1200, height: 630, alt: page.imageAlt };
  return {
    metadataBase: new URL(origin),
    ...(page.title ? { title: page.title } : {}),
    description: page.description,
    alternates: {
      canonical: page.path,
      types: {
        "application/rss+xml": links("rss"),
        "application/atom+xml": links("atom"),
      },
    },
    openGraph: {
      type: page.type ?? "website",
      siteName: siteTitle,
      title: page.title ?? siteTitle,
      description: page.description,
      url: page.path,
      images: [image],
      ...(page.type === "article"
        ? {
            publishedTime: page.publishedTime?.toISOString(),
            modifiedTime: page.modifiedTime?.toISOString(),
            tags: page.tags ? [...page.tags] : undefined,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: page.title ?? siteTitle,
      description: page.description,
      images: [image],
    },
    ...(page.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
