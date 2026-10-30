import { Fragment } from "react";

import {
  layoutParallel,
  layoutPassage,
  paragraphLines,
  type Block,
  type Inline,
  type Note,
} from "@/lib/bible/layout";
import type { Translation } from "@/lib/bible/passage";
import type { VerseRecord } from "@/lib/bible/types";
import type { VerseMark } from "@/lib/items/marks";
import { formatVerseId, parseVerseId } from "@/lib/bible/verse-id";

// Renders Bible text: <Passage> for one translation, <ParallelPassage> for
// several side by side. Both are plain server-renderable components with no
// state; they take verses as stored (one list per range of the passage) and
// print them with verse numbers, headings, paragraph and line breaks,
// red-letter text, footnotes and the translation's attribution.
//
// Every verse's text is wrapped in an element carrying `data-verse-id`, the
// canonical id; a verse split across paragraphs or lines of poetry has one
// such element in each. The `passage-*` classes are in src/app/globals.css.
//
// Verses can be made selectable without giving the components any state:
// with `verseHref`, each verse number is a link to the same passage with that
// verse selected, and the verses of `selected` are marked `data-selected`.
// The reader wraps the passage in <VerseSelect>, which turns a click anywhere
// in a verse into the same navigation.
//
// Highlights are shown the same way: `highlight` says what a verse looks like
// and the verse carries it as `data-highlight` (a color id of
// src/lib/items/palette.ts, styled in globals.css); `highlightNotes` lists
// the notes to reach from a verse, each printed after it as a small link.

// What makes verses selectable; both components take it.
export type VerseSelection = {
  // Where selecting a verse goes.
  verseHref?: (verseId: number) => string;
  // Whether a verse is selected.
  isSelected?: (verseId: number) => boolean;
  // What a verse number's link is called; "Study John 3:16" unless given.
  verseLabel?: (verseId: number) => string;
};

// A link after a verse to the note of a highlight that ends there.
export type VerseNote = { id: string; href: string; label: string; text: string };

// The highlights on the verses; both components take it.
export type VerseHighlights = {
  highlight?: (verseId: number) => VerseMark | undefined;
  highlightNotes?: (verseId: number) => readonly VerseNote[];
};

function NoteLinks({ notes }: { notes: readonly VerseNote[] }) {
  return notes.map((note) => (
    <a
      key={note.id}
      href={note.href}
      data-selection-link
      data-highlight-note={note.id}
      aria-label={note.label}
      title={note.text}
      className="passage-highlight-note"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="inline size-[0.8em] fill-current">
        <path fillRule="evenodd" d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v7a1.5 1.5 0 0 1-1.5 1.5H7.4l-3.2 3.3a.5.5 0 0 1-.9-.3V11h-.8A1.5 1.5 0 0 1 2 9.5Zm3 2a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1Zm0 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1Z" />
      </svg>
    </a>
  ));
}

// A verse number, as a link when verses are selectable.
function VerseNumber({
  verseId,
  number,
  verseHref,
  isSelected,
  verseLabel,
}: { verseId: number; number: number } & VerseSelection) {
  if (!verseHref) return number;
  return (
    <a
      href={verseHref(verseId)}
      data-verse-link={verseId}
      aria-label={verseLabel?.(verseId) ?? `Study ${formatVerseId(verseId)}`}
      aria-current={isSelected?.(verseId) ? "true" : undefined}
      className="passage-verse-link"
    >
      {number}
    </a>
  );
}

// `idPrefix` keeps footnote anchors unique when a page shows several passages.
const noteId = (idPrefix: string, note: Note) => `${idPrefix}-note-${note.index}`;
const refId = (idPrefix: string, note: Note) => `${idPrefix}-ref-${note.index}`;

function Inlines({ inlines, idPrefix }: { inlines: Inline[]; idPrefix: string }) {
  return inlines.map((inline, i) =>
    inline.type === "note" ? (
      <sup key={i} className="passage-note-ref">
        <a
          id={refId(idPrefix, inline.note)}
          href={`#${noteId(idPrefix, inline.note)}`}
          role="doc-noteref"
          aria-label={`Footnote ${inline.note.marker}`}
        >
          {inline.note.marker}
        </a>
      </sup>
    ) : inline.wordsOfJesus ? (
      <span key={i} data-words-of-jesus className="passage-red-letter">
        {inline.text}
      </span>
    ) : (
      <Fragment key={i}>{inline.text}</Fragment>
    ),
  );
}

function Blocks({
  blocks,
  idPrefix,
  verseNumbers = true,
  verseHref,
  isSelected,
  verseLabel,
  highlight,
  highlightNotes,
}: {
  blocks: Block[];
  idPrefix: string;
  verseNumbers?: boolean;
} & VerseSelection &
  VerseHighlights) {
  // A verse may be printed in several pieces; a note's link follows the last.
  const lastPiece = new Map<number, string>();
  if (highlightNotes) {
    blocks.forEach((block, i) => {
      if (block.type !== "paragraph") return;
      paragraphLines(block.parts).forEach((line, j) =>
        line.forEach((part, k) => {
          if (part.join !== "inline") lastPiece.set(part.verseId, `${i}-${j}-${k}`);
        }),
      );
    });
  }
  return blocks.map((block, i) => {
    switch (block.type) {
      case "gap":
        return (
          <hr
            key={i}
            className="mx-auto my-6 w-16 border-stone-300 dark:border-stone-700"
          />
        );
      case "chapter":
        return (
          <h2
            key={i}
            className="mt-8 mb-2 font-sans text-sm font-semibold tracking-wide text-stone-500 uppercase first:mt-0 dark:text-stone-400"
          >
            {block.label}
          </h2>
        );
      case "heading":
        return block.kind === "section" ? (
          <h3
            key={i}
            data-heading={block.kind}
            className="mt-6 mb-2 font-sans text-base font-semibold text-stone-900 first:mt-0 dark:text-stone-100"
          >
            <Inlines inlines={block.inlines} idPrefix={idPrefix} />
          </h3>
        ) : (
          <p
            key={i}
            data-heading={block.kind}
            className="my-2 text-[0.9em] text-stone-600 italic dark:text-stone-400"
          >
            <Inlines inlines={block.inlines} idPrefix={idPrefix} />
          </p>
        );
      case "paragraph": {
        const lines = paragraphLines(block.parts);
        const poetry = lines.length > 1;
        return (
          <p key={i} className="passage-paragraph">
            {lines.map((line, j) => {
              const parts = line.map((part, k) => {
                if (part.join === "inline") return <Fragment key={k}> </Fragment>;
                const mark = highlight?.(part.verseId);
                return (
                  <span
                    key={k}
                    data-verse-id={part.verseId}
                    data-selected={isSelected?.(part.verseId) ? "" : undefined}
                    data-highlight={mark?.color}
                    data-highlight-under={mark?.under}
                  >
                    {verseNumbers && part.number !== undefined && (
                      <sup data-verse-number className="passage-verse-number">
                        <VerseNumber
                          verseId={part.verseId}
                          number={part.number}
                          verseHref={verseHref}
                          isSelected={isSelected}
                          verseLabel={verseLabel}
                        />
                      </sup>
                    )}
                    <Inlines inlines={part.inlines} idPrefix={idPrefix} />
                    {highlightNotes && lastPiece.get(part.verseId) === `${i}-${j}-${k}` && (
                      <NoteLinks notes={highlightNotes(part.verseId)} />
                    )}
                  </span>
                );
              });
              return poetry ? (
                <span key={j} data-line className="passage-line">
                  {parts}
                </span>
              ) : (
                <Fragment key={j}>{parts}</Fragment>
              );
            })}
          </p>
        );
      }
    }
  });
}

function verseLabel(verseId: number): string {
  const ref = parseVerseId(verseId);
  return ref ? `${ref.chapter}:${ref.verse}` : "";
}

function Notes({
  notes,
  idPrefix,
  label = "Footnotes",
}: {
  notes: Note[];
  idPrefix: string;
  label?: string;
}) {
  if (notes.length === 0) return null;
  return (
    <section aria-label={label} role="doc-endnotes" className="font-sans text-sm">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
        {label}
      </h2>
      <ol className="space-y-1.5">
        {notes.map((note) => (
          <li
            key={note.index}
            id={noteId(idPrefix, note)}
            className="-mx-2 flex gap-2 rounded px-2 py-0.5 leading-6 text-stone-700 target:bg-amber-100 dark:text-stone-300 dark:target:bg-amber-900/40"
          >
            <a
              href={`#${refId(idPrefix, note)}`}
              aria-label={`Back to footnote ${note.marker} in the text`}
              className="passage-note-back w-5 shrink-0"
            >
              {note.marker}
            </a>
            <span>
              <span className="mr-1.5 text-stone-500 tabular-nums dark:text-stone-400">
                {verseLabel(note.verseId)}
              </span>
              {note.text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// The translation's attribution, as its `translation` row words it. Shown
// wherever the translation's text is.
export function Attribution({
  translation,
}: {
  translation: Pick<Translation, "id" | "attribution" | "sourceUrl">;
}) {
  return (
    <p
      data-attribution={translation.id}
      className="font-sans text-xs leading-5 text-stone-500 dark:text-stone-400"
    >
      {translation.attribution}{" "}
      <a
        href={translation.sourceUrl}
        rel="noreferrer"
        className="underline decoration-stone-300 underline-offset-2 hover:text-stone-700 dark:decoration-stone-600 dark:hover:text-stone-200"
      >
        Source
      </a>
    </p>
  );
}

// The verses as a quote: numbers, paragraphs, lines of poetry and red
// letters, without footnotes, and without headings unless asked. What a
// passage block shows in the editor, what its study sidebar reads and what a
// passage card of the feed quotes; the caller prints the attribution.
export function PassageQuote({
  ranges,
  headings = false,
  verseNumbers = true,
  ...verses
}: VerseSelection &
  VerseHighlights & {
    ranges: readonly (readonly VerseRecord[])[];
    headings?: boolean;
    verseNumbers?: boolean;
  }) {
  const text = (inlines: Inline[]) => inlines.filter((inline) => inline.type === "text");
  const blocks = layoutPassage(ranges).blocks.flatMap((block): Block[] => {
    if (block.type === "heading") return headings ? [{ ...block, inlines: text(block.inlines) }] : [];
    if (block.type !== "paragraph") return [block];
    return [{ ...block, parts: block.parts.map((part) => ({ ...part, inlines: text(part.inlines) })) }];
  });
  return (
    <div className="passage-text">
      <Blocks blocks={blocks} idPrefix="quote" verseNumbers={verseNumbers} {...verses} />
    </div>
  );
}

type PassageProps = VerseSelection &
  VerseHighlights & {
  translation: Translation;
  // The verses of each range of the passage, as getPassages() returns them.
  ranges: readonly (readonly VerseRecord[])[];
  // Unique on the page; prefixes the ids of footnotes and their markers.
  idPrefix?: string;
};

// A passage in one translation. Renders nothing but the attribution when the
// translation has none of the verses; callers say so in their own words.
export function Passage({
  translation,
  ranges,
  idPrefix = translation.id,
  ...verses
}: PassageProps) {
  const { blocks, notes } = layoutPassage(ranges);
  return (
    <div data-passage={translation.id} className="space-y-6">
      <div className="passage-text">
        <Blocks blocks={blocks} idPrefix={idPrefix} {...verses} />
      </div>
      <Notes notes={notes} idPrefix={idPrefix} />
      <Attribution translation={translation} />
    </div>
  );
}

type ParallelPassageProps = VerseSelection &
  VerseHighlights & {
  // Two or more translations with the same ranges, in column order.
  columns: readonly {
    translation: Translation;
    ranges: readonly (readonly VerseRecord[])[];
  }[];
  // What the table is of, for its accessible name: "John 3:16-21".
  caption: string;
  idPrefix?: string;
};

// The same passage in several translations, one column each, with every verse
// on its own row so the translations stay aligned. A translation that lacks a
// verse has an empty cell saying so. A row carries its verse's selection and
// highlight, so the cell of a translation without the verse shows them too.
export function ParallelPassage({
  columns,
  caption,
  idPrefix = "p",
  verseHref,
  isSelected,
  verseLabel,
  highlight,
  highlightNotes,
}: ParallelPassageProps) {
  const { rows, notes } = layoutParallel(columns.map((column) => column.ranges));
  const prefix = (t: number) => `${idPrefix}-${columns[t].translation.id}`;

  return (
    <div className="space-y-8">
      <div className="-mx-6 overflow-x-auto px-6">
        <table
          data-parallel
          className="w-full table-fixed border-collapse"
          style={{ minWidth: `${2.5 + columns.length * 15}rem` }}
        >
          <caption className="sr-only">
            {caption} in {columns.map((column) => column.translation.abbrev).join(", ")}
          </caption>
          <colgroup>
            <col className="w-10" />
            {columns.map((column) => (
              <col key={column.translation.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-stone-300 text-left font-sans dark:border-stone-700">
              <th scope="col">
                <span className="sr-only">Verse</span>
              </th>
              {columns.map(({ translation }) => (
                <th key={translation.id} scope="col" className="px-3 pb-2 align-bottom">
                  <span className="block text-sm font-semibold">{translation.abbrev}</span>
                  <span className="block text-xs font-normal text-stone-500 dark:text-stone-400">
                    {translation.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.type === "verse" ? (
                <tr
                  key={i}
                  data-verse-row={row.verseId}
                  data-selected={isSelected?.(row.verseId) ? "" : undefined}
                  data-highlight={highlight?.(row.verseId)?.color}
                  data-highlight-under={highlight?.(row.verseId)?.under}
                  className="passage-row"
                >
                  <th scope="row">
                    <VerseNumber
                      verseId={row.verseId}
                      number={row.number}
                      verseHref={verseHref}
                      isSelected={isSelected}
                      verseLabel={verseLabel}
                    />
                    {highlightNotes && (
                      <span className="block">
                        <NoteLinks notes={highlightNotes(row.verseId)} />
                      </span>
                    )}
                  </th>
                  {row.cells.map((blocks, t) => (
                    <td
                      key={columns[t].translation.id}
                      data-translation={columns[t].translation.id}
                      className="passage-text"
                    >
                      {blocks ? (
                        <Blocks blocks={blocks} idPrefix={prefix(t)} verseNumbers={false} />
                      ) : (
                        <span
                          data-missing-verse
                          className="font-sans text-sm text-stone-500 italic dark:text-stone-400"
                        >
                          Not in the {columns[t].translation.abbrev}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ) : (
                <tr key={i}>
                  {row.type === "chapter" ? (
                    <th
                      scope="rowgroup"
                      colSpan={columns.length + 1}
                      className="pt-8 pb-2 text-left font-sans text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
                    >
                      {row.label}
                    </th>
                  ) : (
                    <td colSpan={columns.length + 1} className="h-6 bg-stone-100 dark:bg-stone-900" />
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-6">
        {columns.map(({ translation }, t) => (
          <div key={translation.id} data-passage={translation.id} className="space-y-2">
            <Notes
              notes={notes[t]}
              idPrefix={prefix(t)}
              label={`${translation.abbrev} footnotes`}
            />
            <Attribution translation={translation} />
          </div>
        ))}
      </div>
    </div>
  );
}
