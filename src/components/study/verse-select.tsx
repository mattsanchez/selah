"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import type { VerseRange } from "@/lib/bible/verse-id";
import { readerPath } from "@/lib/reader-url";
import { nextSelection } from "@/lib/verse-selection";

export const STUDY_PANEL_ID = "study-panel";

// Where focus goes once the navigation a click or Escape here started has
// rendered: into the panel, or back to a verse's number. Module state rather
// than a ref: the page is mounted afresh when its query changes.
let focusNext: "panel" | number | undefined;

type VerseSelectProps = {
  // The passage on show and its `t` parameter: where a selection navigates.
  ranges: readonly VerseRange[];
  t?: string;
  // The selection the page was rendered with.
  selection: readonly VerseRange[];
  // A passage rendered with `verseHref`.
  children: ReactNode;
};

// Makes the verses of the passage inside it selectable. A click anywhere in
// a verse (or on its number, which is a link and so works from the keyboard
// and without JavaScript) navigates to the same page with the selection that
// nextSelection() gives, without scrolling. Escape clears the selection.
//
// It keeps no state of its own: the URL holds the selection, and the page
// renders what it says. Focus follows a selection made here into the study
// panel, and returns to the verse when the panel is closed with Escape.
export function VerseSelect({ ranges, t, selection, children }: VerseSelectProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const selectionKey = selection.map((range) => `${range.start}-${range.end}`).join(",");

  useEffect(() => {
    const target = focusNext;
    focusNext = undefined;
    if (target === undefined) return;
    const element =
      target === "panel"
        ? document.getElementById(STUDY_PANEL_ID)
        : root.current?.querySelector<HTMLElement>(`[data-verse-link="${target}"]`);
    element?.focus({ preventScroll: true });
  }, [selectionKey]);

  useEffect(() => {
    if (selection.length === 0) return;
    const verseId = selection[0].start;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      focusNext = verseId;
      router.push(readerPath(ranges, t), { scroll: false });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey stands for selection
  }, [selectionKey, ranges, t, router]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    // Leave modified clicks to the browser: a new tab, a text selection.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element;
    const verse = target.closest<HTMLElement>("[data-verse-id], [data-verse-row]");
    if (!verse || !root.current?.contains(verse)) return;
    // Other links in a verse, such as footnote markers, keep their own job.
    const link = target.closest("a");
    if (link && !link.hasAttribute("data-verse-link")) return;
    // Dragging across text to copy it is not a click on a verse.
    if (!link && !window.getSelection()?.isCollapsed) return;

    const verseId = Number(verse.dataset.verseId ?? verse.dataset.verseRow);
    if (!Number.isInteger(verseId)) return;
    event.preventDefault();
    focusNext = "panel";
    router.push(readerPath(ranges, t, { v: nextSelection(selection, verseId) }), {
      scroll: false,
    });
  }

  return (
    // The verse numbers inside are links, which is the keyboard's way in.
    <div ref={root} className="verse-select" onClick={onClick}>
      {children}
    </div>
  );
}
