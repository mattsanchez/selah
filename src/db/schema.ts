import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

import type { Break, Footnote, Heading, Span } from "@/lib/bible/types";

// Drizzle schema: the tables of the data model in docs/spec.md. After changing
// it, generate a migration with `pnpm db:generate`.

// "local": the text is stored in `verse`. "api": fetched per request from a
// licensed provider and never stored in bulk.
export const translationProvider = pgEnum("translation_provider", ["local", "api"]);

export const translation = pgTable("translation", {
  // Lowercase slug, e.g. "bsb".
  id: text().primaryKey(),
  name: text().notNull(),
  abbrev: text().notNull(),
  license: text().notNull(),
  // Shown wherever the text appears.
  attribution: text().notNull(),
  sourceUrl: text("source_url").notNull(),
  provider: translationProvider().notNull().default("local"),
});

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const verse = pgTable(
  "verse",
  {
    translationId: text("translation_id")
      .notNull()
      .references(() => translation.id, { onDelete: "cascade" }),
    // Canonical BBCCCVVV id, shared across translations; see src/lib/bible/verse-id.ts.
    verseId: integer("verse_id").notNull(),
    // Plain text; lines are separated by "\n".
    text: text().notNull(),
    headings: jsonb().$type<Heading[]>().notNull().default([]),
    footnotes: jsonb().$type<Footnote[]>().notNull().default([]),
    // Paragraph and line starts, and red-letter spans, as offsets into `text`.
    breaks: jsonb().$type<Break[]>().notNull().default([]),
    wordsOfJesus: jsonb("words_of_jesus").$type<Span[]>().notNull().default([]),
    // What keyword search matches (src/lib/bible/search.ts): the verse's words
    // at weight A and the words of its headings, psalm titles included, at
    // weight B. Kept up to date by Postgres; never written or read as a value.
    search: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('english'::regconfig, "text"), 'A') || setweight(jsonb_to_tsvector('english'::regconfig, jsonb_path_query_array("headings", '$[*].text'), '["string"]'), 'B')`,
    ),
  },
  (table) => [
    primaryKey({ columns: [table.translationId, table.verseId] }),
    index("verse_verse_id_idx").on(table.verseId),
    index("verse_search_idx").using("gin", table.search),
  ],
);

// Where commentary comes from. "study_notes" are a study Bible's notes, shown
// under their own heading.
export const commentaryKind = pgEnum("commentary_kind", ["commentary", "study_notes"]);

// One row per commentary or set of study notes; every `commentary_entry`
// carries its license and attribution through it.
export const commentarySource = pgTable("commentary_source", {
  // Lowercase slug, e.g. "matthew-henry".
  id: text().primaryKey(),
  name: text().notNull(),
  kind: commentaryKind().notNull(),
  license: text().notNull(),
  // Shown wherever the text appears.
  attribution: text().notNull(),
  sourceUrl: text("source_url").notNull(),
  // Display order.
  position: integer().notNull().default(0),
});

// What a source says about an inclusive range of verse ids: a verse, a
// section, a whole chapter (its introduction) or a whole book. One row per
// source and range.
export const commentaryEntry = pgTable(
  "commentary_entry",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => commentarySource.id, { onDelete: "cascade" }),
    verseStart: integer("verse_start").notNull(),
    verseEnd: integer("verse_end").notNull(),
    // Sanitized at import to the tags of src/lib/study/html.ts, and passed
    // through renderStudyHtml() again before it is printed.
    html: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.verseStart, table.verseEnd] }),
    index("commentary_entry_verse_start_idx").on(table.verseStart),
  ],
);

// A cross reference from one verse to a verse or range, with the votes
// OpenBible.info's readers gave it. Its license and attribution are
// CROSS_REFERENCES in src/lib/study/sources.ts.
export const crossRef = pgTable(
  "cross_ref",
  {
    fromVerse: integer("from_verse").notNull(),
    toStart: integer("to_start").notNull(),
    toEnd: integer("to_end").notNull(),
    votes: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromVerse, table.toStart, table.toEnd] })],
);
