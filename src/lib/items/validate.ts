import { normalizeRanges } from "@/lib/bible/ranges";
import { parseReference } from "@/lib/bible/reference";
import type { VerseRange } from "@/lib/bible/verse-id";
import type { Errors, Result } from "@/lib/settings/validate";

import { isHighlightColor, type HighlightColorId } from "./palette";

// Validation of what the highlight forms submit. Pure functions: the server
// actions call them, and so do the unit tests.

// A highlight's note is one line.
export const MAX_NOTE_LENGTH = 280;
// Runs of verses in one highlight; far more than a hand selects.
export const MAX_ITEM_PASSAGES = 100;

export type HighlightField = "passage" | "color" | "note";

// A note as it is stored: one line, or null when there is none.
export function normalizeNote(note: string): string | null {
  return note.normalize("NFC").replace(/\s+/g, " ").trim() || null;
}

export function noteError(note: string | null): string | undefined {
  // Counted as the browser's maxlength counts, in UTF-16 code units.
  if (note && note.length > MAX_NOTE_LENGTH) {
    return `Keep the note to ${MAX_NOTE_LENGTH} characters; this one has ${note.length}.`;
  }
}

export function colorError(color: string): string | undefined {
  if (!isHighlightColor(color)) return "Choose one of the colors.";
}

// The verses a form names, written like the reader's `v` parameter
// ("john-3.16-18,20"). The reference parser only reads verses that exist, so
// every id that comes out is a canonical verse id.
export function parsePassages(v: string): VerseRange[] | undefined {
  const parsed = parseReference(v.trim());
  if (!parsed.ok) return undefined;
  const ranges = normalizeRanges(parsed.ranges);
  return ranges.length > 0 && ranges.length <= MAX_ITEM_PASSAGES ? ranges : undefined;
}

export type HighlightEdit = { color: HighlightColorId; note: string | null };
export type NewHighlight = HighlightEdit & {
  passages: VerseRange[];
  translationId: string | null;
};

// What can be changed about a highlight afterwards: its color and its note.
export function validateHighlightEdit(input: {
  color: string;
  note: string;
}): Result<HighlightEdit, HighlightField> {
  const note = normalizeNote(input.note);
  const errors: Errors<HighlightField> = {};
  const color = colorError(input.color);
  if (color) errors.color = color;
  const tooLong = noteError(note);
  if (tooLong) errors.note = tooLong;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { color: input.color as HighlightColorId, note } };
}

// A new highlight: the selected verses, a color, an optional note, and the
// translation the verses were read in (ignored unless it is one of
// `translationIds`).
export function validateNewHighlight(
  input: { v: string; color: string; note: string; translationId?: string },
  translationIds: readonly string[],
): Result<NewHighlight, HighlightField> {
  const edit = validateHighlightEdit(input);
  const passages = parsePassages(input.v);
  if (!edit.ok || !passages) {
    return {
      ok: false,
      errors: {
        ...(edit.ok ? {} : edit.errors),
        ...(passages ? {} : { passage: "Select the verses to highlight first." }),
      },
    };
  }
  const translationId =
    input.translationId && translationIds.includes(input.translationId)
      ? input.translationId
      : null;
  return { ok: true, value: { ...edit.value, passages, translationId } };
}
