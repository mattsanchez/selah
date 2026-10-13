import { applyFormatting } from "@/lib/bible/import/formatting";
import { normalizeTranslation, type HelloaoTranslation } from "@/lib/bible/import/helloao";
import { BIBLE_SOURCES, type BibleSource, type FormattingSource } from "@/lib/bible/import/sources";
import type { UsfmBook } from "@/lib/bible/import/usfm";
import { readZip } from "@/lib/bible/import/zip";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRecord } from "@/lib/bible/types";
import { formatVerseId } from "@/lib/bible/verse-id";
import { canonicalVerseId } from "@/lib/bible/versification";
import { studyText } from "@/lib/study/html";
import type { SkippedLine } from "@/lib/study/import/openbible";
import { normalizeSwordEntries, type SwordEntry } from "@/lib/study/import/sword";
import { normalizeTyndaleItems, type TyndaleItem } from "@/lib/study/import/tyndale";
import { COMMENTARY_SOURCES } from "@/lib/study/sources";
import type { CommentaryRecord, CrossRef } from "@/lib/study/types";

import type { CatalogEntry } from "../catalog";

// Turns what the import reads from a pinned file into a flat list of units
// (verses, commentary entries or cross references) that two copies of the
// file can be compared by. Nothing is parsed here: each format goes through
// the import's own reader, so the check compares what the import would load.

export type Unit = {
  // The same in both copies for the same verse, entry or reference.
  key: string;
  // How an issue names it: "John 3:16".
  label: string;
  // Its words.
  text: string;
  // Everything else the import reads about it, by name, each in a form that
  // is equal when nothing changed.
  facets: Record<string, string>;
};

export type Family = "verses" | "entries" | "references";

export type Reading = { family: Family; units: Unit[] };

function bibleSource(id: string): BibleSource {
  const source = BIBLE_SOURCES.find((each) => each.id === id);
  if (!source) throw new Error(`"${id}" is not a Bible source`);
  return source;
}

// The translation a formatting file belongs to.
export function formattedSource(
  entry: CatalogEntry,
): (BibleSource & { formatting: FormattingSource }) | undefined {
  const source = BIBLE_SOURCES.find((each) => `${each.id}-formatting` === entry.id);
  return source?.formatting ? { ...source, formatting: source.formatting } : undefined;
}

export function verseRecords(source: BibleSource, content: HelloaoTranslation): VerseRecord[] {
  return normalizeTranslation(content, {
    translationId: source.id,
    stripFootnoteOrigin: source.stripFootnoteOrigin,
    pilcrowParagraphs: source.pilcrowParagraphs,
  });
}

const verseUnits = (verses: readonly VerseRecord[]): Unit[] =>
  verses.map((verse) => ({
    key: String(verse.verseId),
    label: formatVerseId(verse.verseId),
    text: verse.text,
    facets: {
      "paragraph and line breaks": JSON.stringify(verse.breaks),
      "red-letter spans": JSON.stringify(verse.wordsOfJesus),
      headings: JSON.stringify(verse.headings),
      footnotes: JSON.stringify(verse.footnotes),
    },
  }));

// A verse of a USFM file under the id the translation stores it by; undefined
// for one outside the canon.
export function usfmVerseId(
  translationId: string,
  usfm: string,
  verse: { chapter: number; verse: number },
): number | undefined {
  try {
    return canonicalVerseId(translationId, { usfm, ...verse });
  } catch {
    return undefined;
  }
}

function usfmUnits(translationId: string, books: readonly UsfmBook[]): Unit[] {
  return books.flatMap((book) =>
    book.verses.map((verse) => {
      const id = usfmVerseId(translationId, book.id, verse);
      const own = `${book.id} ${verse.chapter}:${verse.verse}`;
      return {
        key: own,
        label: id === undefined ? own : formatVerseId(id),
        text: verse.text,
        facets: {
          "paragraph breaks": JSON.stringify(verse.paragraphs),
          "red-letter spans": JSON.stringify(verse.wordsOfJesus),
        },
      };
    }),
  );
}

const entryUnits = (records: readonly CommentaryRecord[]): Unit[] =>
  records.map((record) => ({
    key: `${record.verseStart}-${record.verseEnd}`,
    label: formatReference([{ start: record.verseStart, end: record.verseEnd }]),
    text: studyText(record.html),
    facets: { markup: record.html },
  }));

const referenceUnits = (rows: readonly CrossRef[]): Unit[] =>
  rows.map((row) => ({
    key: `${row.fromVerse}:${row.toStart}:${row.toEnd}`,
    label: `${formatVerseId(row.fromVerse)} to ${formatReference([{ start: row.toStart, end: row.toEnd }])}`,
    text: "",
    facets: { votes: String(row.votes) },
  }));

// The units of a pinned file's content, as `entry.file.read` returned it.
// Throws when the import could not load this content.
export function readUnits(entry: CatalogEntry, content: unknown): Reading {
  switch (entry.format) {
    case "helloao-json":
      return {
        family: "verses",
        units: verseUnits(verseRecords(bibleSource(entry.id), content as HelloaoTranslation)),
      };
    case "usfm-zip": {
      const source = formattedSource(entry);
      if (!source) throw new Error(`"${entry.id}" is not a formatting source`);
      return { family: "verses", units: usfmUnits(source.id, content as UsfmBook[]) };
    }
    case "openbible-zip": {
      const { rows } = content as { rows: CrossRef[]; skipped: SkippedLine[] };
      return { family: "references", units: referenceUnits(rows) };
    }
    case "sword-zip":
    case "tyndale-zip": {
      const source = COMMENTARY_SOURCES.find((each) => each.id === entry.id);
      if (!source) throw new Error(`"${entry.id}" is not a commentary source`);
      const records =
        source.format === "sword"
          ? normalizeSwordEntries(content as SwordEntry[], source)
          : normalizeTyndaleItems(content as TyndaleItem[]).records;
      return { family: "entries", units: entryUnits(records) };
    }
  }
}

const ink = (text: string) => text.replace(/\s+/g, "");

// Where a translation's two sources stand against each other: the verses
// whose words differ between them (spacing aside) or that only one has, and
// the verses whose paragraph or red-letter marks the import could not place
// because of it.
export function compareSources(
  source: BibleSource & { formatting: FormattingSource },
  translation: HelloaoTranslation,
  books: readonly UsfmBook[],
): { differing: Set<number>; unplaced: Set<number> } {
  const verses = verseRecords(source, translation);
  const stored = new Map(verses.map((verse) => [verse.verseId, ink(verse.text)]));
  const differing = new Set<number>();
  const seen = new Set<number>();
  for (const book of books) {
    for (const verse of book.verses) {
      const id = usfmVerseId(source.id, book.id, verse);
      // A verse the publisher leaves empty has no row in either source.
      if (id === undefined || verse.text === "") continue;
      seen.add(id);
      if (stored.get(id) !== ink(verse.text)) differing.add(id);
    }
  }
  for (const id of stored.keys()) if (!seen.has(id)) differing.add(id);
  const { report } = applyFormatting(verses, books, {
    translationId: source.id,
    kind: source.formatting.kind,
  });
  return { differing, unplaced: new Set(report.skipped.map(({ verseId }) => verseId)) };
}

const plain = (text: string) => text.replace(/\s+/g, " ").trim();
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// The lines of a SWORD module's configuration that state its terms.
const SWORD_TERMS = /^(DistributionLicense|DistributionNotes|Copyright\w*|ShortCopyright|TextSource|About)=/;

// What a file says about its own license, by where it says it. These are the
// statements DATA-LICENSES.md and the notices in ../catalog.ts quote, so a
// change in one means those need reading again. A publisher's web page is not
// read: only what travels inside the file.
export function licenseStatements(
  format: CatalogEntry["format"],
  bytes: Uint8Array,
): Record<string, string> {
  const statements: Record<string, string> = {};
  try {
    if (format === "helloao-json") {
      const { translation } = JSON.parse(decode(bytes)) as { translation?: Record<string, unknown> };
      for (const field of ["name", "website", "licenseUrl", "license"]) {
        const value = translation?.[field];
        if (value !== undefined) {
          statements[`translation.${field}`] = typeof value === "string" ? value : JSON.stringify(value);
        }
      }
      return statements;
    }
    const wanted = {
      "usfm-zip": /(^|\/)copr\.htm$/i,
      "openbible-zip": /(^|\/)cross_references\.txt$/,
      "sword-zip": /(^|\/)mods\.d\/[^/]+\.conf$/i,
      "tyndale-zip": /(^|\/)_README\.txt$/i,
    }[format];
    for (const [name, content] of readZip(bytes, (path) => wanted.test(path))) {
      const text = decode(content);
      if (format === "usfm-zip") {
        statements[name] = plain(text.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));
      } else if (format === "openbible-zip") {
        // "#www.openbible.info CC-BY 2026-10-12": the date is the build's.
        const header = text.slice(0, text.indexOf("\n")).split("\t")[3] ?? "";
        statements[`${name} header`] = plain(header.replace(/\d{4}-\d{2}-\d{2}/, ""));
      } else if (format === "sword-zip") {
        for (const line of text.split(/\r?\n/)) {
          if (SWORD_TERMS.test(line)) statements[`${name} ${line.slice(0, line.indexOf("="))}`] = plain(line.slice(line.indexOf("=") + 1));
        }
      } else {
        statements[name] = plain(text);
      }
    }
  } catch {
    // A file that cannot be read has no statements; the check reports that
    // it cannot be read.
  }
  return statements;
}
