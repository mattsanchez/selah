import { eq, sql } from "drizzle-orm";
import { cache } from "react";

import { getDb, type Db } from "@/db/client";
import { site } from "@/db/schema";

import { DEFAULT_TRANSLATION_ID } from "./bible/import/sources";

// Site-wide settings: the one row of `site`, written by the setup screen and
// the settings page.

export type Site = typeof site.$inferSelect;

export const DEFAULT_SITE_TITLE = "Selah";

// The site's settings, or undefined before setup. Read once per request.
export const getSite = cache(async (): Promise<Site | undefined> => {
  const rows = await getDb().select().from(site).where(eq(site.id, 1)).limit(1);
  return rows[0];
});

// The title for page chrome. Never throws: the pages that report a database
// problem need a title too.
export async function getSiteTitle(): Promise<string> {
  try {
    return (await getSite())?.title ?? DEFAULT_SITE_TITLE;
  } catch {
    return DEFAULT_SITE_TITLE;
  }
}

// The translation the reader shows when the URL names none.
export async function getDefaultTranslationId(): Promise<string> {
  return (await getSite())?.defaultTranslationId ?? DEFAULT_TRANSLATION_ID;
}

export async function updateSite(
  db: Db,
  values: Pick<Site, "title" | "handle" | "defaultTranslationId" | "settings">,
): Promise<void> {
  await db
    .update(site)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(site.id, 1));
}
