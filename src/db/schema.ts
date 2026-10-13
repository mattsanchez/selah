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
