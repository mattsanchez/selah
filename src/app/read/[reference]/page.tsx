import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "next/link";

import { PanelTabs, ReaderAskPanel } from "@/components/ask/reader-ask-panel";
import { SelectionHighlights } from "@/components/highlights/selection-highlights";
import { ParallelPassage, Passage } from "@/components/passage/passage";
import { ReaderShell } from "@/components/reader/reader-shell";
import { TranslationPicker } from "@/components/reader/translation-picker";
import { StudyPanel, type PanelFootnotes } from "@/components/study/study-panel";
import { VerseSelect } from "@/components/study/verse-select";
import { getDb } from "@/db/client";
import { loadAiProvider } from "@/lib/ai/load";
import { getOwner } from "@/lib/auth/owner";
import { layoutParallel, layoutPassage } from "@/lib/bible/layout";
import { getPassages, listTranslations } from "@/lib/bible/passage";
import { intersectRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference, referenceSlug } from "@/lib/bible/reference";
import { formatVerseId } from "@/lib/bible/verse-id";
import { highlightsOn, placeHighlights } from "@/lib/items/marks";
import { highlightColor } from "@/lib/items/palette";
import { itemsOnPassage } from "@/lib/items/queries";
import { readerPath, selectTranslations, translationParam } from "@/lib/reader-url";
import { getDefaultTranslationId } from "@/lib/site";
import { isSelected, nextSelection, parseSelection, studyVerse } from "@/lib/verse-selection";

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
// parameter names more than one. With verses selected (the `v` parameter)
// the panel opens: the study of the first one and, for the owner, the forms
// that highlight them and write about them. The owner's highlights show on the verses they are
// on, whichever translation is on show. See src/lib/reader-url.ts for the
// URLs.
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
  // Highlights and everything for making them are the owner's alone.
  const owner = await getOwner();
  const add = owner !== null && selection.length > 0 && first(query.add) === "1";
  // Ask spends the owner's key, so it is the owner's alone (the API checks
  // again), and it needs a provider that can answer.
  const canAsk = owner !== null && (await loadAiProvider()).answerModel !== null;
  const ask = canAsk && first(query.ask) === "1";
  if (typed !== referenceSlug(ranges)) {
    redirect(readerPath(ranges, canonicalT, { v: selection, add, full, ask }));
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
  // A verse's number links to what a click on the verse does: select it
  // alone or, while verses are being added, add or remove it.
  const select = add
    ? {
        verseHref: (id: number) =>
          readerPath(ranges, canonicalT, {
            v: nextSelection(selection, id, "toggle", ranges),
            add,
          }),
        isSelected: (id: number) => isSelected(id, selection),
        verseLabel: (id: number) =>
          isSelected(id, selection)
            ? `Remove ${formatVerseId(id)} from the selection`
            : `Add ${formatVerseId(id)} to the selection`,
      }
    : {
        verseHref: (id: number) =>
          readerPath(ranges, canonicalT, { v: [{ start: id, end: id }] }),
        isSelected: (id: number) => isSelected(id, selection),
      };

  // The owner's highlights on the passage. A highlight is on verse ids, so
  // it shows in every translation that has the verse.
  const highlights = owner
    ? await itemsOnPassage(db, { ownerId: owner.id, kind: "highlight", ranges })
    : [];
  const placed = placeHighlights(
    highlights,
    ranges,
    columns.flatMap((column) => column.ranges.flat().map((record) => record.verseId)),
  );
  const marks = owner
    ? {
        highlight: placed.mark,
        highlightNotes: (id: number) =>
          placed.notes(id).map((note) => ({
            id: note.id,
            href: readerPath(ranges, canonicalT, { v: note.ranges }),
            label: `Note on ${formatReference(note.ranges)}: ${note.note}`,
            text: note.note,
          })),
      }
    : {};
  const askHref = readerPath(ranges, canonicalT, { v: selection, ask: true });
  let panel;
  if (ask && columns.length > 0) {
    panel = (
      <ReaderAskPanel
        reference={selection.length > 0 ? formatReference(selection) : reference}
        translationId={columns[0].translation.id}
        closeHref={readerPath(ranges, canonicalT)}
        studyHref={selection.length > 0 ? readerPath(ranges, canonicalT, { v: selection }) : undefined}
        askHref={askHref}
      />
    );
  } else if (verseId !== undefined) {
    // What the owner has written on the selected verses.
    const written = owner
      ? (await itemsOnPassage(db, { ownerId: owner.id, ranges: selection })).filter(
          (item) => item.kind !== "highlight",
        )
      : [];
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
        tabs={canAsk ? <PanelTabs current="study" study={readerPath(ranges, canonicalT, { v: selection })} ask={askHref} /> : undefined}
        actions={
          owner && (
            <SelectionHighlights
              ranges={ranges}
              t={canonicalT}
              selection={selection}
              add={add}
              translationId={columns[0].translation.id}
              highlights={highlightsOn(highlights, selection)}
              written={written}
            />
          )
        }
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
              keep={readerPath(ranges, undefined, { v: selection, add, ask }).split("?")[1]}
            />
          </div>
        )}
        {canAsk && !ask && columns.length > 0 && (
          <p className="mt-3 font-sans text-sm">
            <Link href={askHref} scroll={false} className="text-stone-600 underline underline-offset-4 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100">
              Ask about {selection.length > 0 ? "these verses" : "this passage"}
            </Link>
          </p>
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
          <VerseSelect ranges={ranges} t={canonicalT} selection={selection} add={add}>
            {parallel ? (
              <ParallelPassage columns={columns} caption={reference} {...select} {...marks} />
            ) : (
              <Passage
                translation={columns[0].translation}
                ranges={columns[0].ranges}
                {...select}
                {...marks}
              />
            )}
          </VerseSelect>
        )}

        {placed.hidden.length > 0 && (
          // Highlights with nothing to show them on: every verse they are on
          // is one the translations on show leave out.
          <aside
            data-hidden-highlights
            aria-label="Highlights on verses not shown"
            className="mt-8 font-sans text-sm text-stone-600 dark:text-stone-400"
          >
            <p>
              {placed.hidden.length === 1 ? "A highlight is" : "Highlights are"} on verses that{" "}
              {parallel ? "these translations leave" : `the ${columns[0].translation.abbrev} leaves`}{" "}
              out:
            </p>
            <ul className="mt-1.5 space-y-1">
              {placed.hidden.map((highlight) => {
                const on = intersectRanges(highlight.passages, ranges);
                return (
                  <li
                    key={highlight.id}
                    data-highlight={highlightColor(highlight.color)?.id}
                    className="flex flex-wrap items-center gap-x-2"
                  >
                    <span aria-hidden="true" className="highlight-swatch" />
                    <Link
                      href={readerPath(ranges, canonicalT, { v: on })}
                      scroll={false}
                      className="font-medium text-stone-800 underline underline-offset-4 dark:text-stone-200"
                    >
                      {formatReference(on)}
                    </Link>
                    <span>
                      {highlightColor(highlight.color)?.name}
                      {highlight.note && `: ${highlight.note}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>
    </ReaderShell>
  );
}
