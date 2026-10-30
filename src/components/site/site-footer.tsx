import Link from "next/link";

import { getDb } from "@/db/client";
import { commentarySource } from "@/db/schema";
import { getOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { feedPath } from "@/lib/public-url";
import { getDefaultTranslationId } from "@/lib/site";
import { CROSS_REFERENCES } from "@/lib/study/sources";

const REPOSITORY = "https://github.com/mattsanchez/selah";

const link =
  "underline decoration-stone-300 underline-offset-2 hover:text-stone-800 dark:decoration-stone-600 dark:hover:text-stone-200";

// The foot of every public page: the feeds, and where the site's texts come
// from. DATA-LICENSES.md asks for each source's attribution wherever its
// content appears; the items on a page credit the translations they quote,
// and this lists every source the site (its reader and study panel included)
// draws on, with its license.
export async function SiteFooter() {
  let translations: Awaited<ReturnType<typeof listTranslations>> = [];
  let sources: { id: string; name: string; license: string; sourceUrl: string }[] = [];
  let owner = null;
  try {
    const db = getDb();
    [translations, sources, owner] = await Promise.all([
      listTranslations(db, await getDefaultTranslationId()),
      db
        .select({
          id: commentarySource.id,
          name: commentarySource.name,
          license: commentarySource.license,
          sourceUrl: commentarySource.sourceUrl,
        })
        .from(commentarySource)
        .orderBy(commentarySource.position),
      getOwner(),
    ]);
  } catch {
    // No database: the page reports it; the footer keeps to what it knows.
  }

  return (
    <footer className="site-footer">
      <div className="site-column space-y-4">
        <nav aria-label="Subscribe" className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={feedPath("rss")} className={link}>
            RSS
          </a>
          <a href={feedPath("atom")} className={link}>
            Atom
          </a>
          {!owner && (
            <Link href="/sign-in" className={link}>
              Sign in
            </Link>
          )}
        </nav>

        {translations.length > 0 && (
          <section aria-labelledby="footer-scripture">
            <h2 id="footer-scripture" className="site-footer-heading">
              Scripture
            </h2>
            <ul className="space-y-1">
              {translations.map((translation) => (
                <li key={translation.id} data-footer-source={translation.id}>
                  {translation.attribution}{" "}
                  <a href={translation.sourceUrl} rel="noreferrer" className={link}>
                    Source
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="footer-study">
          <h2 id="footer-study" className="site-footer-heading">
            Study
          </h2>
          <ul className="space-y-1">
            <li data-footer-source={CROSS_REFERENCES.id}>
              {CROSS_REFERENCES.attribution}, {CROSS_REFERENCES.license}.{" "}
              <a href={CROSS_REFERENCES.sourceUrl} rel="noreferrer" className={link}>
                Source
              </a>
            </li>
            {sources.map((source) => (
              <li key={source.id} data-footer-source={source.id}>
                {source.name}, {source.license}.{" "}
                <a href={source.sourceUrl} rel="noreferrer" className={link}>
                  Source
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p>
          Published with{" "}
          <a href={REPOSITORY} className={link}>
            Selah
          </a>
          , open source under the MIT license.{" "}
          <a href={`${REPOSITORY}/blob/main/DATA-LICENSES.md`} className={link}>
            Data licenses
          </a>
        </p>
      </div>
    </footer>
  );
}
