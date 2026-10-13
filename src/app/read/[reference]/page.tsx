import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ParallelPassage, Passage } from "@/components/passage/passage";
import { ReaderShell } from "@/components/reader/reader-shell";
import { TranslationPicker } from "@/components/reader/translation-picker";
import { StudyPanel, type PanelFootnotes } from "@/components/study/study-panel";
import { VerseSelect } from "@/components/study/verse-select";
import { getDb } from "@/db/client";
import { layoutParallel, layoutPassage } from "@/lib/bible/layout";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { formatReference, parseReference, referenceSlug } from "@/lib/bible/reference";
import { readerPath, selectTranslations, translationParam } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";
import { isSelected, parseSelection, studyVerse } from "@/lib/verse-selection";

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
// parameter names more than one. With a verse selected (the `v` parameter)
// the study panel opens on it. See src/lib/reader-url.ts for the URLs.
export default async function PassagePage({ params, searchParams }: Props) {
  const typed = decode((await params).reference);
  const query = await searchParams;
  const t = first(query.t);

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
  const selection = parseSelection(first(query.v), ranges);
  const full = first(query.full);
  if (typed !== referenceSlug(ranges)) {
    redirect(readerPath(ranges, canonicalT, { v: selection, full }));
  }

  const reference = formatReference(ranges);
  const passages = await getPassages(db, selectedIds, ranges);
  const columns = selectedIds.map((id) => ({
    translation: translations.find((translation) => translation.id === id)!,
    ranges: passages.get(id) ?? [],
  }));
  const hasText = (column: (typeof columns)[number]) =>
    column.ranges.some((verses) => verses.length > 0);
  const parallel = columns.length > 1;

  // The study panel is about one verse: the first one selected. In the
  // parallel view it quotes cross references from the first translation and
  // lists every translation's footnotes.
  const verseId = columns.length > 0 ? studyVerse(selection) : undefined;
  const select = {
    verseHref: (id: number) =>
      readerPath(ranges, canonicalT, { v: [{ start: id, end: id }] }),
    isSelected: (id: number) => isSelected(id, selection),
  };
  let panel;
  if (verseId !== undefined) {
    // Footnotes carry the markers and anchors the passage prints them with.
    const notes = parallel
      ? layoutParallel(columns.map((column) => column.ranges)).notes
      : [layoutPassage(columns[0].ranges).notes];
    const footnotes: PanelFootnotes[] = columns.map(({ translation }, i) => ({
      translation,
      notes: notes[i]
        .filter((note) => note.verseId === verseId)
        .map((note) => ({
          marker: note.marker,
          text: note.text,
          href: `#${parallel ? `p-${translation.id}` : translation.id}-ref-${note.index}`,
        })),
    }));
    panel = (
      <StudyPanel
        verseId={verseId}
        ranges={ranges}
        t={canonicalT}
        selection={selection}
        full={full}
        translation={columns[0].translation}
        footnotes={footnotes}
      />
    );
  }

  return (
    <ReaderShell form={{ value: reference, t: canonicalT }} wide={parallel} panel={panel}>
      <div className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-4xl tracking-tight">{reference}</h1>
        {translations.length > 0 && (
          <div className="mt-5">
            <TranslationPicker
              translations={translations.map(({ id, abbrev, name }) => ({ id, abbrev, name }))}
              selected={selectedIds}
              defaultId={defaultId}
              path={readerPath(ranges)}
              keep={readerPath(ranges, undefined, { v: selection }).split("?")[1]}
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
        ) : (
          <VerseSelect ranges={ranges} t={canonicalT} selection={selection}>
            {parallel ? (
              <ParallelPassage columns={columns} caption={reference} {...select} />
            ) : (
              <Passage
                translation={columns[0].translation}
                ranges={columns[0].ranges}
                {...select}
              />
            )}
          </VerseSelect>
        )}
      </div>
    </ReaderShell>
  );
}
