"use client";

import { useActionState, useId } from "react";

import { createNoteAction, type NoteState } from "@/app/items/actions";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { MAX_NOTE_BODY_LENGTH } from "@/lib/items/validate";

type NoteFormProps = {
  // In the reader: the selected verses the note is anchored to, the page they
  // are on and the translation they are being read in, as the highlight form
  // has them. Without it the note is on no passage.
  anchor?: { v: string; p: string; t?: string; translationId: string };
};

const control =
  "w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900";

// The quick post: a few sentences, tags, and who may see it.
export function NoteForm({ anchor }: NoteFormProps) {
  const [state, action] = useActionState<NoteState, FormData>(createNoteAction, {});
  const id = useId();
  const { errors = {}, values } = state;
  const error = errors.markdown ?? errors.passage;

  return (
    <form action={action} className="space-y-3">
      {anchor && (
        <>
          <input type="hidden" name="v" value={anchor.v} />
          <input type="hidden" name="p" value={anchor.p} />
          <input type="hidden" name="t" value={anchor.t ?? ""} />
          <input type="hidden" name="translationId" value={anchor.translationId} />
        </>
      )}
      {errors.passage && <FormMessage kind="error">{errors.passage}</FormMessage>}

      {/* Remounted when it is refilled with what was submitted, after an error. */}
      <div key={JSON.stringify(values ?? null)} className="space-y-3">
        <div>
          <label htmlFor={`${id}-markdown`} className="mb-1.5 block text-sm font-medium">
            Note
          </label>
          <textarea
            id={`${id}-markdown`}
            name="markdown"
            rows={3}
            required
            maxLength={MAX_NOTE_BODY_LENGTH}
            defaultValue={values?.markdown ?? ""}
            aria-invalid={errors.markdown ? true : undefined}
            aria-describedby={error ? `${id}-markdown-error` : undefined}
            className={`${control} py-2 leading-6`}
          />
          {errors.markdown && (
            <p id={`${id}-markdown-error`} role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
              {errors.markdown}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <label htmlFor={`${id}-tags`} className="mb-1.5 block text-sm font-medium">
              Tags <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
            </label>
            <input
              id={`${id}-tags`}
              name="tags"
              type="text"
              defaultValue={values?.tags ?? ""}
              placeholder="grace, prayer"
              autoComplete="off"
              aria-invalid={errors.tags ? true : undefined}
              aria-describedby={errors.tags ? `${id}-tags-error` : undefined}
              className={`${control} h-10`}
            />
            {errors.tags && (
              <p id={`${id}-tags-error`} role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
                {errors.tags}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-visibility`} className="mb-1.5 block text-sm font-medium">
              Visibility
            </label>
            <select
              id={`${id}-visibility`}
              name="visibility"
              defaultValue={values?.visibility ?? "public"}
              className={`${control} h-10`}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
      </div>

      <SubmitButton>Post note</SubmitButton>
    </form>
  );
}
