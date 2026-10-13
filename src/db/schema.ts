import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { Break, Footnote, Heading, Span } from "@/lib/bible/types";
import type { SiteSettings } from "@/lib/site-settings";

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

// The MVP has one role. The enum is here so more can be added without
// changing how the owner is found.
export const userRole = pgEnum("user_role", ["owner"]);

export const user = pgTable(
  "user",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Lowercase; see normalizeEmail in src/lib/settings/validate.ts.
    email: text().notNull().unique(),
    // An Argon2id hash in PHC format (src/lib/auth/password.ts). Never the password.
    passwordHash: text("password_hash").notNull(),
    role: userRole().notNull().default("owner"),
    // A session is valid only while it carries this number; raising it signs
    // out every session (done when the password is reset).
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one owner, enforced by the database: of two setup requests
    // racing each other, the second insert fails.
    uniqueIndex("user_single_owner_idx").on(table.role).where(sql`${table.role} = 'owner'`),
  ],
);

// One row, id 1: the install's settings.
export const site = pgTable(
  "site",
  {
    id: integer().primaryKey().default(1),
    title: text().notNull(),
    // The writer's short name, e.g. "matt"; lowercase letters, digits and hyphens.
    handle: text().notNull(),
    defaultTranslationId: text("default_translation_id")
      .notNull()
      .references(() => translation.id),
    // Everything else, including the AI API keys (encrypted; see src/lib/site-settings.ts).
    settings: jsonb().$type<SiteSettings>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("site_single_row", sql`${table.id} = 1`)],
);

// Magic-link sign-in tokens (Auth.js). `token` is a hash; the token itself is
// only ever in the emailed link.
export const verificationToken = pgTable(
  "verification_token",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const bootStepStatus = pgEnum("boot_step_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

// Progress of the first-boot steps (src/lib/first-boot), one row per step, so
// the app can show what is loading or what failed, and a restart can skip
// what is already done.
export const bootStep = pgTable("boot_step", {
  id: text().primaryKey(),
  position: integer().notNull(),
  title: text().notNull(),
  status: bootStepStatus().notNull().default("pending"),
  // What the step loads, e.g. a pinned checksum. A done step runs again when this changes.
  version: text().notNull(),
  // Why it failed and how to retry; shown to whoever opens the site.
  message: text(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // Touched while the step runs, so a step whose process died can be told from one still working.
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
});
