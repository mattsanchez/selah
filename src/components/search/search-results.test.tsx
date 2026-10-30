import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Translation } from "@/lib/bible/passage";
import type { SearchHit } from "@/lib/bible/search";

import { SearchResults } from "./search-results";

const translation = (id: string): Translation => ({
  id,
  name: `${id.toUpperCase()} Bible`,
  abbrev: id.toUpperCase(),
  license: "Public domain",
  attribution: `Attribution of the ${id.toUpperCase()}.`,
  sourceUrl: `https://example.org/${id}`,
  provider: "local",
});

const hits: SearchHit[] = [
  {
    translationId: "bsb",
    verseId: 43007038,
    score: 1,
    headings: [],
    text: [
      { text: "Streams of ", match: false },
      { text: "living", match: true },
      { text: " ", match: false },
      { text: "water", match: true },
      { text: " will flow <from> within him.", match: false },
    ],
  },
  {
    translationId: "web",
    verseId: 19023001,
    score: 0.4,
    headings: [
      {
        kind: "superscription",
        text: [
          { text: "A ", match: false },
          { text: "Psalm", match: true },
          { text: " by David.", match: false },
        ],
      },
    ],
    text: [{ text: "Yahweh is my shepherd; I shall lack nothing.", match: false }],
  },
];

describe("SearchResults", () => {
  const html = renderToStaticMarkup(
    <SearchResults
      hits={hits}
      translations={["bsb", "web", "kjv"].map(translation)}
      defaultId="bsb"
    />,
  );

  it("links each hit to its verse in the translation it was found in", () => {
    expect(html).toContain('href="/read/john-7.38"');
    expect(html).toContain('href="/read/psalm-23.1?t=web"');
    expect(html).toContain("John 7:38");
    expect(html).toContain("Psalm 23:1");
  });

  it("says which translation each hit is from", () => {
    expect(html).toMatch(/data-result="43007038" data-translation="bsb"/);
    expect(html).toMatch(/title="WEB Bible"[^>]*>WEB</);
  });

  it("marks the matched words and escapes the text", () => {
    expect(html.match(/<mark[^>]*>[^<]*<\/mark>/g)?.map((mark) => mark.replace(/<[^>]+>/g, ""))).toEqual([
      "living",
      "water",
      "Psalm",
    ]);
    expect(html).toContain("will flow &lt;from&gt; within him.");
  });

  it("prints a heading the search matched", () => {
    expect(html).toMatch(/data-heading="superscription"[^>]*>A <mark/);
  });

  it("prints the attribution of each translation quoted, and no other", () => {
    expect(html).toContain("Attribution of the BSB.");
    expect(html).toContain("Attribution of the WEB.");
    expect(html).not.toContain("Attribution of the KJV.");
  });
});

describe("a hit that is a passage", () => {
  const passage: SearchHit = {
    translationId: "bsb",
    verseId: 43014001,
    endVerseId: 43014004,
    score: 1,
    headings: [],
    text: [{ text: "Do not let your hearts be troubled.", match: false }],
  };

  it("names the whole range, and opens the reader on it", () => {
    const html = renderToStaticMarkup(
      <SearchResults hits={[passage]} translations={[translation("bsb")]} defaultId="bsb" />,
    );
    expect(html).toContain("John 14:1-4");
    expect(html).toContain('href="/read/john-14.1-4"');
  });
});
