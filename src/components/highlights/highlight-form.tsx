"use client";

import { useActionState, useId } from "react";

import {
  createHighlightAction,
  updateHighlightAction,
  type HighlightState,
} from "@/app/highlights/actions";
import { focusVerseAfterNavigation } from "@/components/study/verse-select";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS } from "@/lib/items/palette";
import { MAX_NOTE_LENGTH } from "@/lib/items/validate";

type HighlightFormProps =
  | {
      kind: "new";
      // The selected verses and the page they are on, as the reader's `v`
      // parameter, path segment and `t` parameter write them.
      v: string;
      p: string;
      t?: string;
      // The translation the verses are being read in.
      translationId: string;
      // The first verse selected: where focus returns once it is highlighted.
      firstVerse: number;
    }
  | { kind: "edit"; id: string; color: string | null; note: string | null };

// A highlight's color and note: the form that makes a highlight of the
// selected verses, and the one that changes a highlight there already is.
export function HighlightForm(props: HighlightFormProps) {
  const isNew = props.kind === "new";
  const [state, action] = useActionState<HighlightState, FormData>(
    isNew ? createHighlightAction : updateHighlightAction,
    {},
  );
  const id = useId();
  const { errors = {} } = state;
  const color =
    state.values?.color ?? (isNew ? DEFAULT_HIGHLIGHT_COLOR : (props.color ?? DEFAULT_HIGHLIGHT_COLOR));
  const note = state.values?.note ?? (isNew ? "" : (props.note ?? ""));

  return (
    <form
      action={action}
      onSubmit={() => {
        if (isNew) focusVerseAfterNavigation(props.firstVerse);
      }}
      className="space-y-3"
    >
      {isNew ? (
        <>
          <input type="hidden" name="v" value={props.v} />
          <input type="hidden" name="p" value={props.p} />
          <input type="hidden" name="t" value={props.t ?? ""} />
          <input type="hidden" name="translationId" value={props.translationId} />
        </>
      ) : (
        <input type="hidden" name="id" value={props.id} />
      )}

      {state.formError && <FormMessage kind="error">{state.formError}</FormMessage>}

      {/* Remounted when what it starts from changes: after a save, or after
          an error, when it is refilled with what was submitted. */}
      <div key={`${color} ${note}`} className="space-y-3">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-1.5">
            {HIGHLIGHT_COLORS.map((choice) => (
              <label key={choice.id} data-highlight={choice.id} className="highlight-choice">
                <input
                  type="radio"
                  name="color"
                  value={choice.id}
                  defaultChecked={choice.id === color}
                  required
                  className="sr-only"
                />
                <span aria-hidden="true" className="highlight-swatch" />
                {choice.name}
              </label>
            ))}
          </div>
          {errors.color && (
            <p role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
              {errors.color}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">
            Note <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
          </label>
          <input
            id={`${id}-note`}
            name="note"
            type="text"
            maxLength={MAX_NOTE_LENGTH}
            defaultValue={note}
            autoComplete="off"
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? `${id}-note-error` : undefined}
            className="h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900"
          />
          {errors.note && (
            <p
              id={`${id}-note-error`}
              role="alert"
              className="mt-1.5 text-sm text-red-700 dark:text-red-400"
            >
              {errors.note}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>{isNew ? "Highlight" : "Save"}</SubmitButton>
        {state.saved && (
          <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
