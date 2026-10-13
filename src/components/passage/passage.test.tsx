import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { readFixture } from "@/lib/bible/import/fixture";
import type { Translation } from "@/lib/bible/passage";

import { ParallelPassage, Passage } from "./passage";

const translation = (id: string): Translation => ({
  id,
  name: `${id.toUpperCase()} Bible`,
  abbrev: id.toUpperCase(),
  license: "Public domain",
  attribution: `Attribution of the ${id.toUpperCase()}.`,
  sourceUrl: `https://example.org/${id}`,
  provider: "local",
});

async function fixture(translationId: string, start: number, end: number = start) {
  const verses = await readFixture(translationId);
  return verses.filter((verse) => verse.verseId >= start && verse.verseId <= end);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("Passage", () => {
  it("prints verse numbers, headings, linked footnotes and the attribution", async () => {
    const html = renderToStaticMarkup(
      <Passage translation={translation("bsb")} ranges={[await fixture("bsb", 19023001, 19023006)]} />,
    );
    expect(html).toContain('data-heading="section"');
    expect(html).toContain("The LORD Is My Shepherd");
    expect(html).toContain('data-heading="superscription"');
    expect(count(html, "data-verse-number")).toBe(6);
    expect(count(html, 'data-verse-id="19023001"')).toBe(2);

    // Each marker links to its note, and the note links back.
    expect(count(html, 'role="doc-noteref"')).toBe(3);
    for (const i of [0, 1, 2]) {
      expect(html).toContain(`id="bsb-ref-${i}" href="#bsb-note-${i}"`);
      expect(html).toContain(`id="bsb-note-${i}"`);
      expect(html).toContain(`href="#bsb-ref-${i}"`);
    }
    expect(html).toContain("See Revelation 7:17.");
    expect(html).toContain("Attribution of the BSB.");
  });

  it("marks the words of Jesus where the translation does", async () => {
    const render = async (id: string) =>
      renderToStaticMarkup(
        <Passage translation={translation(id)} ranges={[await fixture(id, 43003016)]} />,
      );
    expect(await render("web")).toContain("data-words-of-jesus");
    expect(await render("bsb")).not.toContain("data-words-of-jesus");
  });

  it("keeps footnote ids apart with idPrefix", async () => {
    const html = renderToStaticMarkup(
      <Passage
        translation={translation("bsb")}
        ranges={[await fixture("bsb", 43003016)]}
        idPrefix="card-7"
      />,
    );
    expect(html).toContain('id="card-7-ref-0" href="#card-7-note-0"');
  });
});

describe("ParallelPassage", () => {
  it("aligns verses in rows, noting a verse a translation lacks", async () => {
    const html = renderToStaticMarkup(
      <ParallelPassage
        caption="John 5:3-5"
        columns={[
          { translation: translation("bsb"), ranges: [await fixture("bsb", 43005003, 43005005)] },
          { translation: translation("kjv"), ranges: [await fixture("kjv", 43005003, 43005005)] },
        ]}
      />,
    );
    expect(count(html, "data-verse-row")).toBe(3);
    expect(count(html, "data-missing-verse")).toBe(1);
    expect(html).toContain("Not in the BSB");
    expect(html).toContain("Attribution of the BSB.");
    expect(html).toContain("Attribution of the KJV.");
    expect(html).toContain('id="p-bsb-ref-0"');
  });
});
