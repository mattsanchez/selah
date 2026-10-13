"use client";

import { useActionState } from "react";

import { Field, FormMessage, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

import { setupAction, type SetupState } from "./actions";

type SetupFormProps = {
  translations: readonly { id: string; abbrev: string; name: string }[];
  defaultTranslationId: string;
  // From the link printed in the logs, when it was followed.
  token?: string;
  minPasswordLength: number;
};

export function SetupForm({
  translations,
  defaultTranslationId,
  token,
  minPasswordLength,
}: SetupFormProps) {
  const [state, action] = useActionState<SetupState, FormData>(setupAction, {});
  const { errors = {}, values = {} } = state;

  return (
    <form action={action} className="space-y-10">
      {state.formError && <FormMessage kind="error">{state.formError}</FormMessage>}

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">Prove it is your install</legend>
        <Field
          label="Setup token"
          name="token"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={values.token ?? token}
          error={errors.token}
          hint={
            <>
              Printed in the server&rsquo;s logs when it starts. With Docker:{" "}
              <code>docker compose logs app</code>.
            </>
          }
        />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">Your account</legend>
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={values.email}
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={minPasswordLength}
          autoComplete="new-password"
          error={errors.password}
          hint={`At least ${minPasswordLength} characters. A few unrelated words make a good one.`}
        />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">Your site</legend>
        <Field
          label="Site title"
          name="title"
          type="text"
          required
          maxLength={80}
          defaultValue={values.title}
          error={errors.title}
          hint="Shown at the top of every page."
        />
        <Field
          label="Handle"
          name="handle"
          type="text"
          required
          maxLength={31}
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={values.handle}
          error={errors.handle}
          hint="Your short name as the writer, like matt: lowercase letters, digits and hyphens."
        />
        <SelectField
          label="Default translation"
          name="defaultTranslationId"
          required
          defaultValue={values.defaultTranslationId ?? defaultTranslationId}
          error={errors.defaultTranslationId}
          hint="The translation the reader opens in. You can change it later."
        >
          {translations.map((translation) => (
            <option key={translation.id} value={translation.id}>
              {translation.name} ({translation.abbrev})
            </option>
          ))}
        </SelectField>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">AI (optional)</legend>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Selah works without these. Add them now or later in Settings. They are stored
          encrypted and are never shown again after you save.
        </p>
        <Field
          label="Anthropic API key"
          name="anthropicApiKey"
          type="password"
          autoComplete="off"
          error={errors.anthropicApiKey}
        />
        <Field
          label="Voyage AI API key"
          name="voyageApiKey"
          type="password"
          autoComplete="off"
          error={errors.voyageApiKey}
        />
      </fieldset>

      <SubmitButton>Create account and finish</SubmitButton>
    </form>
  );
}
