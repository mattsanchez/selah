// RSS 2.0 and Atom 1.0, written by hand: a feed is a few elements, and
// writing them here keeps every string escaped in one place.
//
// RSS: https://www.rssboard.org/rss-specification (dates in RFC 822).
// Atom: RFC 4287 (dates in RFC 3339).
//
// Every URL given here must be absolute. Entries carry their full content as
// HTML, which each format holds as escaped text.

export type SyndicationEntry = {
  // Never changes for the item, whatever its title becomes: an absolute URL.
  id: string;
  // The item's page.
  url: string;
  title: string;
  // The whole item, as HTML with absolute links.
  html: string;
  published: Date;
  updated: Date;
  categories: readonly { term: string; label: string }[];
};

export type Syndication = {
  title: string;
  description: string;
  // The page the feed is of, and the feed itself.
  link: string;
  self: string;
  author: string;
  // Where a category's term leads: the tag's page, with the term after it.
  categoryScheme: string;
  updated: Date;
  entries: readonly SyndicationEntry[];
};

// Characters XML 1.0 does not allow anywhere, escaped or not, and lone
// surrogates.
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const element = (name: string, text: string, attributes = "") =>
  `<${name}${attributes}>${escapeXml(text)}</${name}>`;

const attribute = (name: string, value: string) => ` ${name}="${escapeXml(value)}"`;

// "Sun, 18 Oct 2026 09:30:00 GMT": RFC 822 with a four-digit year, as RSS
// readers expect.
export const rfc822 = (date: Date) => date.toUTCString();

// "2026-10-18T09:30:00.000Z".
export const rfc3339 = (date: Date) => date.toISOString();

const GENERATOR = "Selah";

export function rssXml(feed: Syndication): string {
  const items = feed.entries.map((entry) =>
    [
      "<item>",
      element("title", entry.title),
      element("link", entry.url),
      element("guid", entry.id, attribute("isPermaLink", "true")),
      element("pubDate", rfc822(entry.published)),
      ...entry.categories.map((category) =>
        element("category", category.label, attribute("domain", feed.categoryScheme)),
      ),
      element("description", entry.html),
      "</item>",
    ].join(""),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    "<channel>",
    element("title", feed.title),
    element("link", feed.link),
    element("description", feed.description),
    `<atom:link${attribute("href", feed.self)}${attribute("rel", "self")}${attribute("type", "application/rss+xml")}/>`,
    element("language", "en"),
    element("lastBuildDate", rfc822(feed.updated)),
    element("generator", GENERATOR),
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function atomXml(feed: Syndication): string {
  const entries = feed.entries.map((entry) =>
    [
      "<entry>",
      element("id", entry.id),
      element("title", entry.title, attribute("type", "text")),
      `<link${attribute("rel", "alternate")}${attribute("type", "text/html")}${attribute("href", entry.url)}/>`,
      element("published", rfc3339(entry.published)),
      element("updated", rfc3339(entry.updated)),
      ...entry.categories.map(
        (category) =>
          `<category${attribute("term", category.term)}${attribute("label", category.label)}${attribute("scheme", feed.categoryScheme)}/>`,
      ),
      element("content", entry.html, attribute("type", "html")),
      "</entry>",
    ].join(""),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">`,
    element("id", feed.link),
    element("title", feed.title, attribute("type", "text")),
    element("subtitle", feed.description, attribute("type", "text")),
    `<link${attribute("rel", "alternate")}${attribute("type", "text/html")}${attribute("href", feed.link)}/>`,
    `<link${attribute("rel", "self")}${attribute("type", "application/atom+xml")}${attribute("href", feed.self)}/>`,
    element("updated", rfc3339(feed.updated)),
    `<author>${element("name", feed.author)}</author>`,
    element("generator", GENERATOR),
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
