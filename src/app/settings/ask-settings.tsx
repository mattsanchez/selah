"use client";

import { useActionState, useTransition } from "react";

import { Field, FormMessage } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

import {
  clearAskAnswersAction,
  saveAskCapAction,
  testAnthropicKeyAction,
  type AskCapState,
  type KeyTestState,
} from "./actions";

type AskSettingsProps = {
  // Whether this install can answer.
  on: boolean;
  // Whether there is an Anthropic key, which is not the same when AI_PROVIDER says otherwise.
  keySet: boolean;
  cap: number;
  used: number;
  savedAnswers: number;
};

const number = (value: number) => value.toLocaleString("en");

// Ask's state, the day's cap and the saved answers.
export function AskSettings({ on, keySet, cap, used, savedAnswers }: AskSettingsProps) {
  const [capState, saveCap] = useActionState<AskCapState, FormData>(saveAskCapAction, {});
  const [test, runTest] = useActionState<KeyTestState>(testAnthropicKeyAction, {});
  const [testing, startTest] = useTransition();

  if (!on) {
    return (
      <p data-ask-state="off" className="text-sm text-stone-600 dark:text-stone-400">
        {keySet
          ? "Ask is off on this install: AI_PROVIDER leaves it out."
          : "Add an Anthropic API key above to ask about a passage in the reader and in the editor. Everything else works without one."}
      </p>
    );
  }
  return (
    <div data-ask-state="on" className="space-y-5">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Ask is on, for you alone. Today: <span data-ask-used>{number(used)}</span> of {number(cap)} questions. Saved answers do
        not count, and the count starts again at midnight UTC.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={testing} aria-busy={testing || undefined} onClick={() => startTest(runTest)}>
          Test the key
        </Button>
        {test.message && <FormMessage kind={test.ok ? "success" : "error"}>{test.message}</FormMessage>}
      </div>

      <form action={saveCap} className="space-y-3">
        {capState.saved && <FormMessage kind="success">Daily limit saved.</FormMessage>}
        <Field
          label="Questions a day"
          name="dailyCap"
          type="number"
          min={1}
          required
          defaultValue={cap}
          error={capState.error}
          hint="How many questions may reach Claude in a day, on your key."
        />
        <SubmitButton>Save the limit</SubmitButton>
      </form>

      <form action={clearAskAnswersAction} className="space-y-3">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <span data-ask-saved-count>{number(savedAnswers)}</span> saved {savedAnswers === 1 ? "answer" : "answers"}. A
          repeated question is answered from these for nothing.
        </p>
        <SubmitButton>Clear saved answers</SubmitButton>
      </form>
    </div>
  );
}
