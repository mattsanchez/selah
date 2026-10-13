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
    const render = async (id: string, verseId: number) =>
      renderToStaticMarkup(
        <Passage translation={translation(id)} ranges={[await fixture(id, verseId)]} />,
      );
    for (const id of ["bsb", "web", "kjv"]) {
      expect(await render(id, 43003016)).toContain("data-words-of-jesus");
      expect(await render(id, 43003001)).not.toContain("data-words-of-jesus");
    }
    // BSB John 13:38: Jesus speaks twice, around "Jesus replied."
    expect(count(await render("bsb", 43013038), "data-words-of-jesus")).toBe(2);
  });

  it("starts a paragraph where one starts inside a verse of prose", async () => {
    // WEB John 1:21: three changes of speaker, each a new paragraph.
    const html = renderToStaticMarkup(
      <Passage translation={translation("web")} ranges={[await fixture("web", 43001020, 43001022)]} />,
    );
    expect(count(html, '<p class="passage-paragraph">')).toBe(6);
    expect(count(html, 'data-verse-id="43001021"')).toBe(4);
    expect(count(html, "data-verse-number")).toBe(3);
    expect(html).toContain('<p class="passage-paragraph"><span data-verse-id="43001021">He said, “I am not.”</span></p>');
    // Prose stays prose: no line of poetry, and no line break left in the text.
    expect(html).not.toContain("data-line");
    expect(html).not.toContain("\n");
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

  it("starts a paragraph inside a cell where one starts inside the verse", async () => {
    const html = renderToStaticMarkup(
      <ParallelPassage
        caption="John 1:21"
        columns={["web", "kjv"].map((id) => ({ translation: translation(id), ranges: [[]] }))}
      />,
    );
    expect(html).not.toContain("passage-paragraph");

    const columns = await Promise.all(
      ["web", "kjv"].map(async (id) => ({
        translation: translation(id),
        ranges: [await fixture(id, 43001021)],
      })),
    );
    const cells = renderToStaticMarkup(<ParallelPassage caption="John 1:21" columns={columns} />)
      .split("<td ")
      .slice(1);
    expect(cells).toHaveLength(2);
    expect(count(cells[0], '<p class="passage-paragraph">')).toBe(4);
    expect(count(cells[1], '<p class="passage-paragraph">')).toBe(1);
    expect(cells[0]).not.toContain("data-line");
  });
});

describe("selectable verses", () => {
  const select = {
    verseHref: (verseId: number) => `/read/john-3.16-17?v=${verseId}`,
    isSelected: (verseId: number) => verseId === 43003016,
  };

  it("links each verse number and marks the selected verse", async () => {
    const ranges = [await fixture("bsb", 43003016, 43003017)];
    const html = renderToStaticMarkup(
      <Passage translation={translation("bsb")} ranges={ranges} {...select} />,
    );
    expect(html).toContain(
      '<a href="/read/john-3.16-17?v=43003016" data-verse-link="43003016" aria-label="Study John 3:16" aria-current="true"',
    );
    expect(html).toContain(
      '<a href="/read/john-3.16-17?v=43003017" data-verse-link="43003017" aria-label="Study John 3:17" class',
    );
    expect(count(html, "data-selected")).toBe(count(html, 'data-verse-id="43003016"'));

    // Without them the markup is what it was.
    const plain = renderToStaticMarkup(<Passage translation={translation("bsb")} ranges={ranges} />);
    expect(plain).not.toContain("data-verse-link");
    expect(plain).not.toContain("data-selected");
  });

  it("does the same for the rows of the parallel view", async () => {
    const html = renderToStaticMarkup(
      <ParallelPassage
        caption="John 3:16-17"
        columns={[
          { translation: translation("bsb"), ranges: [await fixture("bsb", 43003016, 43003017)] },
          { translation: translation("web"), ranges: [await fixture("web", 43003016, 43003017)] },
        ]}
        {...select}
      />,
    );
    expect(html).toContain('<tr data-verse-row="43003016" data-selected="" class="passage-row">');
    expect(html).toContain('<tr data-verse-row="43003017" class="passage-row">');
    expect(count(html, "data-verse-link")).toBe(2);
  });
});

describe("highlighted verses", () => {
  const marks = {
    highlight: (verseId: number) =>
      verseId === 43003016
        ? { color: "yellow", count: 1 }
        : verseId === 43003017
          ? { color: "blue", under: "yellow", count: 2 }
          : undefined,
    highlightNotes: (verseId: number) =>
      verseId === 43003017
        ? [{ id: "h1", href: "/read/john-3.16-18?v=john-3.16-17", label: "Note on John 3:16-17: Loved", text: "Loved" }]
        : [],
  };

  it("carry their color, the color beneath it, and a link to the note", async () => {
    const html = renderToStaticMarkup(
      <Passage
        translation={translation("bsb")}
        ranges={[await fixture("bsb", 43003016, 43003018)]}
        {...marks}
      />,
    );
    expect(html).toContain('<span data-verse-id="43003016" data-highlight="yellow">');
    expect(html).toContain(
      '<span data-verse-id="43003017" data-highlight="blue" data-highlight-under="yellow">',
    );
    expect(html).toContain('<span data-verse-id="43003018">');
    expect(count(html, "data-highlight-note=")).toBe(1);
    expect(html).toContain(
      '<a href="/read/john-3.16-18?v=john-3.16-17" data-selection-link="true" data-highlight-note="h1" aria-label="Note on John 3:16-17: Loved" title="Loved"',
    );
    // The link is inside the verse it follows, after its text.
    expect(html.indexOf("data-highlight-note=")).toBeGreaterThan(html.indexOf("save the world through Him"));
    expect(html.indexOf("data-highlight-note=")).toBeLessThan(html.indexOf('data-verse-id="43003018"'));
  });

  it("color every piece of a verse printed in several, with one note link after the last", async () => {
    // Psalm 23:1 in the BSB is two lines of poetry.
    const html = renderToStaticMarkup(
      <Passage
        translation={translation("bsb")}
        ranges={[await fixture("bsb", 19023001, 19023002)]}
        highlight={(verseId) => (verseId === 19023001 ? { color: "green", count: 1 } : undefined)}
        highlightNotes={(verseId) =>
          verseId === 19023001 ? [{ id: "h2", href: "/x", label: "Note", text: "Shepherd" }] : []
        }
      />,
    );
    expect(count(html, 'data-verse-id="19023001" data-highlight="green"')).toBe(2);
    expect(count(html, "data-highlight-note=")).toBe(1);
    expect(html.indexOf("data-highlight-note=")).toBeGreaterThan(html.indexOf("I shall not want"));
  });

  it("color the whole row of the parallel view, a missing verse's cell included", async () => {
    const html = renderToStaticMarkup(
      <ParallelPassage
        caption="John 5:3-5"
        columns={[
          { translation: translation("bsb"), ranges: [await fixture("bsb", 43005003, 43005005)] },
          { translation: translation("kjv"), ranges: [await fixture("kjv", 43005003, 43005005)] },
        ]}
        highlight={(verseId) => (verseId === 43005004 ? { color: "pink", count: 1 } : undefined)}
        highlightNotes={(verseId) =>
          verseId === 43005004 ? [{ id: "h3", href: "/y", label: "Note", text: "The angel" }] : []
        }
      />,
    );
    expect(html).toContain('<tr data-verse-row="43005004" data-highlight="pink" class="passage-row">');
    expect(html).toContain('<tr data-verse-row="43005003" class="passage-row">');
    const row = html.slice(html.indexOf('data-verse-row="43005004"'), html.indexOf('data-verse-row="43005005"'));
    expect(row).toContain("data-missing-verse");
    expect(count(row, "data-highlight-note=")).toBe(1);
    expect(count(html, "data-highlight-note=")).toBe(1);
  });

  it("leave the markup as it was when there are none", async () => {
    const ranges = [await fixture("bsb", 43003016, 43003017)];
    const plain = renderToStaticMarkup(<Passage translation={translation("bsb")} ranges={ranges} />);
    const none = renderToStaticMarkup(
      <Passage
        translation={translation("bsb")}
        ranges={ranges}
        highlight={() => undefined}
        highlightNotes={() => []}
      />,
    );
    expect(none).toBe(plain);
    expect(plain).not.toContain("data-highlight");
  });
});

describe("verse numbers while verses are being added", () => {
  it("say what a click on them does", async () => {
    const html = renderToStaticMarkup(
      <Passage
        translation={translation("bsb")}
        ranges={[await fixture("bsb", 43003016, 43003017)]}
        verseHref={(verseId) => `/toggle/${verseId}`}
        isSelected={(verseId) => verseId === 43003016}
        verseLabel={(verseId) => (verseId === 43003016 ? "Remove John 3:16" : "Add John 3:17")}
      />,
    );
    expect(html).toContain('aria-label="Remove John 3:16"');
    expect(html).toContain('aria-label="Add John 3:17"');
    expect(html).not.toContain("Study John");
  });
});
