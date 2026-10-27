import { describe, expect, it } from "vitest";

import { atomXml, escapeXml, rfc822, rssXml, type Syndication } from "./syndication";

const feed: Syndication = {
  title: "Morning <Pages> & more",
  description: "Highlights, reflections & notes.",
  link: "https://selah.example.org/",
  self: "https://selah.example.org/rss.xml",
  author: "matt",
  categoryScheme: "https://selah.example.org/tag/",
  updated: new Date("2026-10-18T09:30:00Z"),
  entries: [
    {
      id: "https://selah.example.org/p/3f9a2c1b7d4e",
      url: "https://selah.example.org/p/no-condemnation-3f9a2c1b7d4e",
      title: "“No condemnation” & <grace>",
      html: `<p>By <em>grace</em> &amp; faith</p><blockquote><p>Therefore…</p></blockquote>`,
      published: new Date("2026-10-17T08:05:09Z"),
      updated: new Date("2026-10-18T09:30:00Z"),
      categories: [{ term: "holy-spirit", label: "Holy Spirit" }],
    },
  ],
};

// Whether every tag is closed in order and no text holds a bare "<" or "&":
// what an XML parser needs to read the document at all.
function wellFormed(xml: string): boolean {
  const body = xml.replace(/^<\?xml[^>]*\?>/, "");
  const stack: string[] = [];
  for (const [tag] of body.matchAll(/<[^>]*>/g)) {
    const name = /^<\/?([\w:]+)/.exec(tag)?.[1];
    if (!name) return false;
    if (tag.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else if (!tag.endsWith("/>")) {
      stack.push(name);
    }
  }
  const text = body.replace(/<[^>]*>/g, "");
  return stack.length === 0 && !/[<>]/.test(text) && !/&(?!(?:amp|lt|gt|quot|apos);)/.test(text);
}

const element = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}(?: [^>]*)?>([^<]*)</${name}>`, "g"))].map((match) => match[1]);

describe("escapeXml", () => {
  it("escapes markup and drops what XML cannot hold", () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;",
    );
    expect(escapeXml("bell\u0007 and \uD800 lone")).toBe("bell and  lone");
    expect(escapeXml("tab\tline\nemoji 🙏")).toBe("tab\tline\nemoji 🙏");
  });
});

describe("rssXml", () => {
  const xml = rssXml(feed);

  it("is a well-formed RSS 2.0 document", () => {
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"`)).toBe(true);
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain(
      `<atom:link href="https://selah.example.org/rss.xml" rel="self" type="application/rss+xml"/>`,
    );
  });

  it("dates as RFC 822", () => {
    expect(rfc822(new Date("2026-10-17T08:05:09Z"))).toBe("Sat, 17 Oct 2026 08:05:09 GMT");
    expect(element(xml, "pubDate")).toEqual(["Sat, 17 Oct 2026 08:05:09 GMT"]);
    expect(element(xml, "lastBuildDate")).toEqual(["Sun, 18 Oct 2026 09:30:00 GMT"]);
  });

  it("carries each entry's whole content, escaped", () => {
    expect(element(xml, "title")).toEqual([
      "Morning &lt;Pages&gt; &amp; more",
      "“No condemnation” &amp; &lt;grace&gt;",
    ]);
    expect(element(xml, "description")[1]).toBe(
      "&lt;p&gt;By &lt;em&gt;grace&lt;/em&gt; &amp;amp; faith&lt;/p&gt;&lt;blockquote&gt;&lt;p&gt;Therefore…&lt;/p&gt;&lt;/blockquote&gt;",
    );
    expect(xml).toContain(
      `<guid isPermaLink="true">https://selah.example.org/p/3f9a2c1b7d4e</guid>`,
    );
    expect(xml).toContain(`<category domain="https://selah.example.org/tag/">Holy Spirit</category>`);
  });
});

describe("atomXml", () => {
  const xml = atomXml(feed);

  it("is a well-formed Atom document with what RFC 4287 requires", () => {
    expect(xml).toContain(`<feed xmlns="http://www.w3.org/2005/Atom"`);
    expect(wellFormed(xml)).toBe(true);
    expect(element(xml, "id")).toEqual([
      "https://selah.example.org/",
      "https://selah.example.org/p/3f9a2c1b7d4e",
    ]);
    expect(xml).toContain(`<author><name>matt</name></author>`);
    expect(xml).toContain(
      `<link rel="self" type="application/atom+xml" href="https://selah.example.org/rss.xml"/>`,
    );
  });

  it("dates as RFC 3339", () => {
    expect(element(xml, "updated")).toEqual(["2026-10-18T09:30:00.000Z", "2026-10-18T09:30:00.000Z"]);
    expect(element(xml, "published")).toEqual(["2026-10-17T08:05:09.000Z"]);
  });

  it("carries each entry's whole content as escaped HTML", () => {
    expect(xml).toContain(`<content type="html">&lt;p&gt;By &lt;em&gt;grace`);
    expect(xml).toContain(
      `<category term="holy-spirit" label="Holy Spirit" scheme="https://selah.example.org/tag/"/>`,
    );
  });

  it("is well-formed with no entries", () => {
    expect(wellFormed(atomXml({ ...feed, entries: [] }))).toBe(true);
    expect(wellFormed(rssXml({ ...feed, entries: [] }))).toBe(true);
  });
});
