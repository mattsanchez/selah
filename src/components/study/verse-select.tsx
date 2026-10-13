"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import type { VerseRange } from "@/lib/bible/verse-id";
import { readerPath } from "@/lib/reader-url";
import { nextSelection, type SelectMode } from "@/lib/verse-selection";

export const STUDY_PANEL_ID = "study-panel";

// Where focus goes once the navigation a click or Escape here started has
// rendered: into the panel, or back to a verse's number. Module state rather
// than a ref: the page is mounted afresh when its query changes.
let focusNext: "panel" | number | undefined;

// The selection a click here has asked for and the page has not rendered
// yet. A second click made meanwhile (click, then Shift-click, quickly) builds
// on it rather than on the selection still on screen.
let pending: VerseRange[] | undefined;

// For a form that navigates when it is done (a new highlight clears the
// selection): where focus should land afterwards.
export function focusVerseAfterNavigation(verseId: number): void {
  focusNext = verseId;
}

type VerseSelectProps = {
  // The passage on show and its `t` parameter: where a selection navigates.
  ranges: readonly VerseRange[];
  t?: string;
  // The selection the page was rendered with.
  selection: readonly VerseRange[];
  // The page's `add` parameter: a plain click adds or removes a verse.
  add?: boolean;
  // A passage rendered with `verseHref`.
  children: ReactNode;
};

const VERSE = "[data-verse-id], [data-verse-row]";

// Makes the verses of the passage inside it selectable. A click anywhere in
// a verse (or on its number, which is a link and so works from the keyboard
// and without JavaScript) navigates to the same page with the selection that
// nextSelection() gives, without scrolling:
//
// - a plain click, tap or Enter selects that verse alone, and opens the panel;
// - with Shift it selects every verse from the selection to that one;
// - with Ctrl or Command, on the verse's text, it adds or removes that verse;
// - while the page is adding verses (`add`), every click adds or removes one:
//   the way to select verses that are apart by touch or from the keyboard.
//
// Escape clears the selection. It keeps no state of its own: the URL holds
// the selection, and the page renders what it says. Focus follows a verse
// selected alone into the panel, stays on the verse while a selection is
// being built, and returns to the verse when the panel is closed with Escape.
export function VerseSelect({ ranges, t, selection, add = false, children }: VerseSelectProps) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const selectionKey = selection.map((range) => `${range.start}-${range.end}`).join(",");

  useEffect(() => {
    pending = undefined;
    const target = focusNext;
    focusNext = undefined;
    if (target === undefined) return;
    const element =
      target === "panel"
        ? document.getElementById(STUDY_PANEL_ID)
        : root.current?.querySelector<HTMLElement>(`[data-verse-link="${target}"]`);
    element?.focus({ preventScroll: true });
  }, [selectionKey, add]);

  useEffect(() => {
    if (selection.length === 0) return;
    const verseId = selection[0].start;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape in a field (a highlight's note) is not about the selection.
      if ((event.target as Element | null)?.closest?.("input, textarea, select")) return;
      focusNext = verseId;
      router.push(readerPath(ranges, t), { scroll: false });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectionKey stands for selection
  }, [selectionKey, ranges, t, router]);

  const verseOf = (target: Element) => {
    const verse = target.closest<HTMLElement>(VERSE);
    return verse && root.current?.contains(verse) ? verse : null;
  };

  // A Shift-click would first stretch the browser's text selection to the
  // click; it is a selection of verses here.
  function onMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button === 0 && event.shiftKey && verseOf(event.target as Element)) {
      event.preventDefault();
    }
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.altKey) return;
    const target = event.target as Element;
    const link = target.closest("a");
    const modified = event.metaKey || event.ctrlKey;

    // A link that selects verses of its own choosing: a highlight's note.
    if (link?.hasAttribute("data-selection-link") && root.current?.contains(link)) {
      if (modified || event.shiftKey) return;
      event.preventDefault();
      focusNext = "panel";
      router.push(link.getAttribute("href")!, { scroll: false });
      return;
    }

    const verse = verseOf(target);
    if (!verse) return;
    // Other links in a verse, such as footnote markers, keep their own job,
    // and Ctrl or Command on a verse's number opens it in a new tab.
    if (link && (!link.hasAttribute("data-verse-link") || modified)) return;

    const mode: SelectMode = event.shiftKey
      ? "extend"
      : modified || add
        ? "toggle"
        : "replace";
    // Dragging across text to copy it is not a click on a verse.
    if (!link && mode !== "extend" && !window.getSelection()?.isCollapsed) return;

    const verseId = Number(verse.dataset.verseId ?? verse.dataset.verseRow);
    if (!Number.isInteger(verseId)) return;
    event.preventDefault();
    const next = nextSelection(pending ?? selection, verseId, mode, ranges);
    pending = next;
    focusNext = mode === "replace" && next.length > 0 ? "panel" : verseId;
    router.push(readerPath(ranges, t, { v: next, add }), { scroll: false });
  }

  return (
    // The verse numbers inside are links, which is the keyboard's way in.
    <div ref={root} className="verse-select" onMouseDown={onMouseDown} onClick={onClick}>
      {children}
    </div>
  );
}
