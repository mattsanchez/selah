import Link from "next/link";
import type { ReactNode } from "react";

import { getDb } from "@/db/client";
import { getPassages, type Translation } from "@/lib/bible/passage";
import { formatReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import { readerPath } from "@/lib/reader-url";
import { renderStudyHtml } from "@/lib/study/html";
import { getCommentary, getCrossReferences, type SourceCommentary } from "@/lib/study/queries";
import { CROSS_REFERENCES } from "@/lib/study/sources";
import type { CommentaryRecord } from "@/lib/study/types";

import { STUDY_PANEL_ID } from "./verse-select";

// The study panel: what there is to read beside one verse. Cross references
// ranked by votes, the verse's footnotes, public-domain commentary and study
// notes, each with its source's attribution.
//
// A server component: the page renders it when the URL has a verse selected,
// and it reads what it shows from the database. On a wide screen it is a
// column fixed to the right of the window; on a narrow one, a sheet along the
// bottom.

// How many cross references show before "Show more".
const CROSS_REFERENCES_SHOWN = 8;
// About how many characters of an entry show before "Read in full".
const ENTRY_PREVIEW_CHARS = 600;
const PREVIEW_CHARS = 240;

export type PanelFootnotes = {
  translation: Translation;
  // The verse's footnotes, with the marker each has in the passage and the
  // address of that marker.
  notes: { marker: string; text: string; href: string }[];
};

type StudyPanelProps = {
  // The verse the panel is about.
  verseId: number;
  // The page it is on: the passage, its `t` parameter and the selection.
  ranges: readonly VerseRange[];
  t?: string;
  selection: readonly VerseRange[];
  // The commentary source to print in full, from the `full` parameter.
  full?: string;
  // The translation cross references are quoted in.
  translation: Translation;
  // One per translation on show.
  footnotes: readonly PanelFootnotes[];
};

// Verse text on one line, cut to a preview.
function preview(texts: readonly string[]): string {
  const text = texts.join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, "")}…`;
}

const smallLink =
  "underline decoration-stone-300 underline-offset-2 hover:text-stone-800 dark:decoration-stone-600 dark:hover:text-stone-100";

function Section({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section data-study-section={name} aria-labelledby={`study-${name}`} className="mt-7">
      <h3
        id={`study-${name}`}
        className="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function SourceAttribution({
  id,
  attribution,
  license,
  sourceUrl,
}: {
  id: string;
  attribution: string;
  license: string;
  sourceUrl: string;
}) {
  return (
    <p data-attribution={id} className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
      {attribution}{" "}
      <span className="whitespace-nowrap">
        ({license};{" "}
        <a href={sourceUrl} rel="noreferrer" className={smallLink}>
          source
        </a>
        )
      </span>
    </p>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-stone-500 dark:text-stone-400">{children}</p>
);

export async function StudyPanel({
  verseId,
  ranges,
  t,
  selection,
  full,
  translation,
  footnotes,
}: StudyPanelProps) {
  const db = getDb();
  const verse = { start: verseId, end: verseId };
  const [crossReferences, commentary] = await Promise.all([
    getCrossReferences(db, verse),
    getCommentary(db, verse),
  ]);
  const targets = crossReferences.map((row) => ({ start: row.toStart, end: row.toEnd }));
  const texts = (await getPassages(db, [translation.id], targets)).get(translation.id) ?? [];

  const title = formatReference([verse]);
  const passageHref = (range: VerseRange) => readerPath([range], t);

  const crossReferenceItem = (i: number) => {
    const row = crossReferences[i];
    const text = preview((texts[i] ?? []).map((record) => record.text));
    return (
      <li key={i} data-cross-reference data-votes={row.votes}>
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={passageHref(targets[i])}
            className="font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            {formatReference([targets[i]])}
          </Link>
          <span className="shrink-0 text-xs text-stone-500 tabular-nums dark:text-stone-400">
            {row.votes} {row.votes === 1 ? "vote" : "votes"}
          </span>
        </div>
        <p className="mt-0.5 font-serif text-[0.95rem] leading-6 text-stone-700 dark:text-stone-300">
          {text || (
            <span className="font-sans text-sm text-stone-500 italic dark:text-stone-400">
              Not in the {translation.abbrev} as loaded here
            </span>
          )}
        </p>
      </li>
    );
  };
  const shown = crossReferences.slice(0, CROSS_REFERENCES_SHOWN).map((_, i) => i);
  const more = crossReferences.slice(CROSS_REFERENCES_SHOWN).map((_, i) => i + shown.length);

  const entry = (source: SourceCommentary["source"], record: CommentaryRecord) => {
    const expanded = full === source.id;
    const { html, truncated } = renderStudyHtml(record.html, {
      href: passageHref,
      limit: expanded ? undefined : ENTRY_PREVIEW_CHARS,
    });
    return (
      <>
        <div className="study-html" dangerouslySetInnerHTML={{ __html: html }} />
        {truncated && (
          <p className="mt-1.5 text-sm">
            <Link
              href={`${readerPath(ranges, t, { v: selection, full: source.id })}#study-source-${source.id}`}
              scroll={false}
              className={`text-stone-600 dark:text-stone-300 ${smallLink}`}
            >
              Read in full
            </Link>
          </p>
        )}
      </>
    );
  };
  const sources = (kind: "commentary" | "study_notes") =>
    commentary
      .filter((group) => group.source.kind === kind)
      .map(({ source, entries }) => (
        <article
          key={source.id}
          id={`study-source-${source.id}`}
          data-source={source.id}
          className="mt-5 scroll-mt-4 first:mt-0"
        >
          <h4 className="text-sm font-semibold">{source.name}</h4>
          {entries.map((record, i) => {
            const label = formatReference([{ start: record.verseStart, end: record.verseEnd }]);
            // The most specific entry is open; the broader ones (the section,
            // chapter or book the verse is in) open on request.
            return i === 0 ? (
              <div key={label} data-entry={label} className="mt-1.5">
                <p className="mb-1 text-xs text-stone-500 dark:text-stone-400">On {label}</p>
                {entry(source, record)}
              </div>
            ) : (
              <details key={label} data-entry={label} className="mt-2">
                <summary className="cursor-pointer text-sm text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100">
                  On {label}
                </summary>
                <div className="mt-1.5">{entry(source, record)}</div>
              </details>
            );
          })}
          <SourceAttribution {...source} />
          {full === source.id && (
            <p className="mt-1.5 text-sm">
              <Link
                href={readerPath(ranges, t, { v: selection })}
                scroll={false}
                className={`text-stone-600 dark:text-stone-300 ${smallLink}`}
              >
                Show less
              </Link>
            </p>
          )}
        </article>
      ));
  const commentaries = sources("commentary");
  const studyNotes = sources("study_notes");
  const several = footnotes.length > 1;

  return (
    <aside
      id={STUDY_PANEL_ID}
      tabIndex={-1}
      aria-labelledby="study-title"
      data-study-verse={verseId}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[55vh] overflow-y-auto border-t border-stone-300 bg-white px-5 pt-4 pb-8 font-sans shadow-[0_-8px_24px_rgba(0,0,0,0.08)] outline-none lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[26rem] lg:border-t-0 lg:border-l lg:shadow-none dark:border-stone-700 dark:bg-stone-950"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Study
          </p>
          <h2 id="study-title" className="font-serif text-2xl tracking-tight">
            {title}
          </h2>
        </div>
        <Link
          href={readerPath(ranges, t)}
          scroll={false}
          aria-label="Close the study panel"
          className="rounded-md border border-stone-300 px-2.5 py-1 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Close
        </Link>
      </div>

      <Section name="cross-references" title="Cross references">
        {crossReferences.length === 0 ? (
          <Empty>No cross references for this verse.</Empty>
        ) : (
          <>
            <ol className="space-y-3">{shown.map(crossReferenceItem)}</ol>
            {more.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100">
                  Show {more.length} more
                </summary>
                <ol start={shown.length + 1} className="mt-3 space-y-3">
                  {more.map(crossReferenceItem)}
                </ol>
              </details>
            )}
            <SourceAttribution
              id={CROSS_REFERENCES.id}
              attribution={`${CROSS_REFERENCES.attribution}, ranked by its readers’ votes. Quoted from the ${translation.abbrev}.`}
              license={CROSS_REFERENCES.license}
              sourceUrl={CROSS_REFERENCES.sourceUrl}
            />
          </>
        )}
      </Section>

      <Section name="footnotes" title="Footnotes">
        {footnotes.every((group) => group.notes.length === 0) ? (
          <Empty>
            No footnotes on this verse in the{" "}
            {footnotes.map((group) => group.translation.abbrev).join(", ")}.
          </Empty>
        ) : (
          footnotes
            .filter((group) => group.notes.length > 0)
            .map(({ translation: of, notes }) => (
              <div key={of.id} data-footnotes={of.id} className="mt-3 first:mt-0">
                {several && <h4 className="mb-1 text-sm font-semibold">{of.abbrev}</h4>}
                <ul className="space-y-1.5 text-sm leading-6 text-stone-700 dark:text-stone-300">
                  {notes.map((note) => (
                    <li key={note.href} className="flex gap-2">
                      <a
                        href={note.href}
                        aria-label={`Footnote ${note.marker} in the text`}
                        className="passage-note-back w-5 shrink-0"
                      >
                        {note.marker}
                      </a>
                      <span>{note.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Translators’ notes of the {of.name}.
                </p>
              </div>
            ))
        )}
      </Section>

      <Section name="commentary" title="Commentary">
        {commentaries.length > 0 ? commentaries : <Empty>No commentary on this verse.</Empty>}
      </Section>

      <Section name="study-notes" title="Study notes">
        {studyNotes.length > 0 ? studyNotes : <Empty>No study notes on this verse.</Empty>}
      </Section>
    </aside>
  );
}
