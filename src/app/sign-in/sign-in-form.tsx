"use client";

import { useActionState } from "react";

import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

import { signInAction, type SignInState } from "./actions";

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<SignInState, FormData>(signInAction, {});
  const error = state.error ?? notice;

  return (
    <form action={action} className="space-y-5">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="username"
        defaultValue={state.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
