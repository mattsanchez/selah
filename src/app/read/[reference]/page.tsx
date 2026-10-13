import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ParallelPassage, Passage } from "@/components/passage/passage";
import { ReaderShell } from "@/components/reader/reader-shell";
import { TranslationPicker } from "@/components/reader/translation-picker";
import { getDb } from "@/db/client";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { formatReference, parseReference, referenceSlug } from "@/lib/bible/reference";
import { readerPath, selectTranslations, translationParam } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";

type Props = PageProps<"/read/[reference]">;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// The path segment as typed. Next.js passes it still percent-encoded.
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const parsed = parseReference(decode((await params).reference));
  return { title: parsed.ok ? formatReference(parsed.ranges) : "Read" };
}

// A passage: in one translation, or in two to four side by side when the `t`
// parameter names more than one. See src/lib/reader-url.ts for the URLs.
export default async function PassagePage({ params, searchParams }: Props) {
  const typed = decode((await params).reference);
  const t = first((await searchParams).t);

  const parsed = parseReference(typed);
  if (!parsed.ok) {
    return (
      <ReaderShell
        form={{ value: typed.replace(/-(?=[a-z])|(?<=[a-z])-/gi, " "), error: parsed.error.message }}
      />
    );
  }
  const { ranges } = parsed;

  const db = getDb();
  const defaultId = await getDefaultTranslationId();
  const translations = await listTranslations(db, defaultId);
  const selectedIds = selectTranslations(
    t,
    translations.map((translation) => translation.id),
    defaultId,
  );
  const canonicalT = translationParam(selectedIds, defaultId);

  // One URL per passage: /read/jn3.16 goes to /read/john-3.16.
  if (typed !== referenceSlug(ranges)) redirect(readerPath(ranges, canonicalT));

  const reference = formatReference(ranges);
  const passages = await getPassages(db, selectedIds, ranges);
  const columns = selectedIds.map((id) => ({
    translation: translations.find((translation) => translation.id === id)!,
    ranges: passages.get(id) ?? [],
  }));
  const hasText = (column: (typeof columns)[number]) =>
    column.ranges.some((verses) => verses.length > 0);
  const parallel = columns.length > 1;

  return (
    <ReaderShell form={{ value: reference, t: canonicalT }} wide={parallel}>
      <div className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight">{reference}</h1>
        {translations.length > 0 && (
          <div className="mt-5">
            <TranslationPicker
              translations={translations.map(({ id, abbrev, name }) => ({ id, abbrev, name }))}
              selected={selectedIds}
              defaultId={defaultId}
              path={readerPath(ranges)}
            />
          </div>
        )}
      </div>

      <div className={`mt-8 ${parallel ? "" : "mx-auto max-w-2xl"}`}>
        {columns.length === 0 ? (
          <p role="status" className="text-stone-600 dark:text-stone-400">
            No translations are loaded yet. Run <code>pnpm import:bible</code> to load them.
          </p>
        ) : !columns.some(hasText) ? (
          <p role="status" className="text-stone-600 dark:text-stone-400">
            {parallel
              ? `None of these translations has text for ${reference}.`
              : `The ${columns[0].translation.name} has no text for ${reference}.`}{" "}
            Some translations leave out verses that others include; try another translation.
          </p>
        ) : parallel ? (
          <ParallelPassage columns={columns} caption={reference} />
        ) : (
          <Passage translation={columns[0].translation} ranges={columns[0].ranges} />
        )}
      </div>
    </ReaderShell>
  );
}
