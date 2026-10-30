import { unzipSync, strFromU8 } from "fflate";
import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import type { Translation } from "@/lib/bible/passage";
import type { VerseRecord } from "@/lib/bible/types";
import type { Item } from "@/lib/items/queries";

import { exportEntries, zipBytes } from "./archive";
import {
  EXPORT_SCHEMA,
  EXPORT_VERSION,
  exportItem,
  exportJson,
  exportSite,
  parseExport,
  type ExportDocument,
} from "./format";
import { frontMatter, itemBody, itemFilePath, quoteMarkdown, type QuoteLookup } from "./markdown";

const when = new Date("2026-10-13T09:30:00.000Z");

const reflection: Item = {
  id: "3f9a2c1b-7d4e-4c2a-9b1e-0c5d2e8f1a3b",
  kind: "reflection",
  title: "On abiding",
  markdown: "Before.\n\n[[John 15:1-2 | BSB]]\n\nAfter **that**.\n\n[[Nonsense 99]]",
  note: null,
  color: null,
  visibility: "public",
  publishedAt: when,
  createdAt: when,
  updatedAt: when,
  passages: [{ start: 43015001, end: 43015002, translationId: "bsb" }],
  tags: [{ slug: "abiding", name: "Abiding" }],
};

const highlight: Item = {
  ...reflection,
  id: "aaaaaaaa-7d4e-4c2a-9b1e-0c5d2e8f1a3b",
  kind: "highlight",
  title: null,
  markdown: null,
  note: "Stay here.",
  color: "yellow",
  visibility: "private",
  publishedAt: null,
  tags: [],
};

const note: Item = {
  ...highlight,
  id: "bbbbbbbb-7d4e-4c2a-9b1e-0c5d2e8f1a3b",
  kind: "note",
  note: null,
  color: null,
  markdown: "A quick thought.",
  passages: [],
};

const bsb: Translation = {
  id: "bsb",
  name: "Berean Standard Bible",
  abbrev: "BSB",
  license: "Public domain",
  attribution: "Berean Standard Bible (BSB), public domain.",
  sourceUrl: "https://berean.bible",
  provider: "local",
};

const verse = (verseId: number, text: string) => ({ verseId, text }) as VerseRecord;

const lookup: QuoteLookup = async (ranges, translation) =>
  translation && {
    translation,
    runs: ranges.map(() => [verse(43015001, "I am the true vine,"), verse(43015002, "He cuts off\nevery branch.")]),
  };

const SITE = { title: "Psalms and coffee", handle: "matt", defaultTranslationId: "bsb" };

async function* from<T>(values: readonly T[]) {
  yield* values;
}

const collect = async (chunks: AsyncIterable<string>) => {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
};

describe("the export's JSON", () => {
  const head = {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    exportedAt: when.toISOString(),
    site: exportSite(SITE),
  } as const;

  it("round-trips", async () => {
    const items = [reflection, highlight, note].map(exportItem);
    const text = await collect(exportJson(head, from(items)));
    const document: ExportDocument = parseExport(text);
    expect(document).toEqual({ ...head, items });
    expect(parseExport(JSON.stringify(document))).toEqual(document);
  });

  it("is valid JSON with no items too", async () => {
    expect(parseExport(await collect(exportJson(head, from([])))).items).toEqual([]);
  });

  it("holds an item in full, with references and verse ids", () => {
    expect(exportItem(reflection)).toEqual({
      id: reflection.id,
      kind: "reflection",
      title: "On abiding",
      markdown: reflection.markdown,
      note: null,
      color: null,
      visibility: "public",
      publishedAt: "2026-10-13T09:30:00.000Z",
      createdAt: "2026-10-13T09:30:00.000Z",
      updatedAt: "2026-10-13T09:30:00.000Z",
      tags: [{ slug: "abiding", name: "Abiding" }],
      passages: [{ reference: "John 15:1-2", verseStart: 43015001, verseEnd: 43015002, translation: "bsb" }],
      permalink: "/p/on-abiding-3f9a2c1b7d4e",
    });
  });

  it("gives a private item no permalink", () => {
    expect(exportItem(highlight).permalink).toBeNull();
  });

  it("refuses what is not an export, or a later version", () => {
    expect(() => parseExport("{}")).toThrow(/not a Selah export/);
    expect(() => parseExport("null")).toThrow(/not a Selah export/);
    expect(() =>
      parseExport(JSON.stringify({ schema: EXPORT_SCHEMA, version: 99, site: {}, items: [] })),
    ).toThrow(/version: 99/);
    expect(() => parseExport(JSON.stringify({ schema: EXPORT_SCHEMA, version: EXPORT_VERSION }))).toThrow(
      /incomplete/,
    );
  });
});

describe("what of the site is exported", () => {
  it("is the title, handle and default translation, and nothing else", () => {
    const site = {
      ...SITE,
      id: 1,
      updatedAt: when,
      settings: { ai: { voyageApiKey: "sealed-voyage-key", anthropicApiKey: "sealed-anthropic-key" } },
    };
    expect(exportSite(site)).toEqual({ title: site.title, handle: "matt", defaultTranslation: "bsb" });
    expect(JSON.stringify(exportSite(site))).not.toContain("sealed");
  });
});

describe("an item's Markdown file", () => {
  it("is named by date, kind and name, and stays unique by the key", () => {
    expect(itemFilePath(reflection)).toBe("items/reflections/2026-10-13-on-abiding-3f9a2c1b7d4e.md");
    expect(itemFilePath(highlight)).toBe("items/highlights/2026-10-13-john-15-1-2-aaaaaaaa7d4e.md");
    expect(itemFilePath(note)).toBe("items/notes/2026-10-13-a-quick-thought-bbbbbbbb7d4e.md");
  });

  it("opens with front matter", () => {
    const text = frontMatter(exportItem(reflection), "On abiding");
    expect(text).toBe(
      [
        "---",
        `id: ${reflection.id}`,
        "kind: reflection",
        `title: "On abiding"`,
        "visibility: public",
        "created: 2026-10-13T09:30:00.000Z",
        "updated: 2026-10-13T09:30:00.000Z",
        "published: 2026-10-13T09:30:00.000Z",
        `tags: ["Abiding"]`,
        `passages: ["John 15:1-2"]`,
        `permalink: "/p/on-abiding-3f9a2c1b7d4e"`,
        "---",
        "",
      ].join("\n"),
    );
  });

  it("escapes a title that YAML would otherwise read as something else", () => {
    const text = frontMatter(exportItem({ ...reflection, title: `A "title": with #marks` }), "x");
    expect(text).toContain(`title: "A \\"title\\": with #marks"`);
  });

  it("writes a card as a blockquote with its reference and attribution", () => {
    const quote = quoteMarkdown(
      { translation: bsb, runs: [[verse(43015001, "I am the true vine,"), verse(43015002, "He cuts off\nevery branch.")]] },
      "John 15:1-2",
    );
    expect(quote).toBe(
      [
        "> **1** I am the true vine,",
        ">",
        "> **2** He cuts off  ",
        "> every branch.",
        ">",
        "> — John 15:1-2 (BSB). Berean Standard Bible (BSB), public domain.",
      ].join("\n"),
    );
  });

  it("leaves a single verse unnumbered", () => {
    expect(quoteMarkdown({ translation: bsb, runs: [[verse(43003016, "For God so loved.")]] }, "John 3:16")).toMatch(
      /^> For God so loved\.\n/,
    );
  });

  it("keeps the words of a reflection, and a card it cannot read as written", async () => {
    const body = await itemBody(reflection, [bsb], lookup);
    expect(body).toContain("# On abiding");
    expect(body).toContain("Before.");
    expect(body).toContain("> **1** I am the true vine,");
    expect(body).toContain("After **that**.");
    expect(body).toContain("[[Nonsense 99]]");
    expect(body).not.toContain("[[John 15:1-2");
  });

  it("quotes a highlight's verses over its note", async () => {
    const body = await itemBody(highlight, [bsb], lookup);
    expect(body.indexOf("true vine")).toBeLessThan(body.indexOf("Stay here."));
  });

  it("writes a note on no passage as its words", async () => {
    expect(await itemBody(note, [bsb], lookup)).toBe("A quick thought.\n");
  });

  it("names a passage it has no text for", async () => {
    expect(await itemBody(highlight, [bsb], async () => undefined)).toContain("> John 15:1-2");
  });
});

describe("the zip", () => {
  const unzip = async (bytes: AsyncIterable<Uint8Array>) => {
    const parts: Uint8Array[] = [];
    for await (const part of bytes) parts.push(part);
    const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      whole.set(part, at);
      at += part.length;
    }
    return unzipSync(whole);
  };

  it("holds every entry whole, with names and text in UTF-8", async () => {
    const files = await unzip(
      zipBytes(
        from([
          { path: "selah-export.json", chunks: from(["{", '"a":', "1}"]) },
          { path: "items/notes/é.md", chunks: ["“Be still”"] },
        ]),
      ),
    );
    expect(Object.keys(files)).toEqual(["selah-export.json", "items/notes/é.md"]);
    expect(strFromU8(files["selah-export.json"])).toBe('{"a":1}');
    expect(strFromU8(files["items/notes/é.md"])).toBe("“Be still”");
  });

  it("gives bytes as entries go, not all at the end", async () => {
    let entriesAsked = 0;
    async function* entries() {
      for (const name of ["a", "b", "c"]) {
        entriesAsked++;
        yield { path: `${name}.txt`, chunks: ["x".repeat(100_000)] };
      }
    }
    const reader = zipBytes(entries());
    await reader.next();
    expect(entriesAsked).toBe(1);
    await reader.return(undefined);
  });

  it("contains every item, and only the owner's", async () => {
    const sent: { sql: string; params: unknown[] }[] = [];
    const db = drizzle(async (sql, params) => {
      sent.push({ sql, params });
      return { rows: [] };
    }) as unknown as Db;
    const entries = [];
    for await (const entry of exportEntries(db, "owner-id", SITE, when)) entries.push(entry.path);
    expect(entries).toEqual(["selah-export.json"]);
    const ids = sent.find((query) => query.sql.includes(`select "id" from "item"`));
    expect(ids?.sql).toContain(`where "item"."owner_id" = $1`);
    expect(ids?.params).toEqual(["owner-id"]);
  });
});
