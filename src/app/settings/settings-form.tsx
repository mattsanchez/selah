"use client";

import { useActionState } from "react";

import { Field, FormMessage, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

import { saveSettingsAction, type SettingsState } from "./actions";

// What the form is told about an API key: where it comes from, never the key.
export type AiKeyView = {
  name: "anthropic" | "voyage";
  label: string;
  env: string;
  source: "environment" | "saved" | "unreadable" | "none";
};

type SettingsFormProps = {
  site: { title: string; handle: string; defaultTranslationId: string };
  translations: readonly { id: string; abbrev: string; name: string }[];
  aiKeys: readonly AiKeyView[];
};

const SOURCE_TEXT = {
  environment: (key: AiKeyView) =>
    `Set by the ${key.env} environment variable, which takes precedence over a key saved here.`,
  saved: () => "A key is saved. It is stored encrypted and cannot be shown again.",
  unreadable: () =>
    "A key is saved but can no longer be read: this install's secret has changed since. Enter it again.",
  none: () => "No key is set.",
} as const;

export function SettingsForm({ site, translations, aiKeys }: SettingsFormProps) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  const { errors = {}, values = {} } = state;

  return (
    <form action={action} className="space-y-10">
      {state.formError && <FormMessage kind="error">{state.formError}</FormMessage>}
      {state.saved && <FormMessage kind="success">Settings saved.</FormMessage>}

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">Site</legend>
        <Field
          label="Site title"
          name="title"
          type="text"
          required
          maxLength={80}
          defaultValue={values.title ?? site.title}
          error={errors.title}
        />
        <Field
          label="Handle"
          name="handle"
          type="text"
          required
          maxLength={31}
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={values.handle ?? site.handle}
          error={errors.handle}
          hint="Lowercase letters, digits and hyphens."
        />
        <SelectField
          label="Default translation"
          name="defaultTranslationId"
          required
          defaultValue={values.defaultTranslationId ?? site.defaultTranslationId}
          error={errors.defaultTranslationId}
        >
          {translations.map((translation) => (
            <option key={translation.id} value={translation.id}>
              {translation.name} ({translation.abbrev})
            </option>
          ))}
        </SelectField>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="font-serif text-2xl tracking-tight">AI keys</legend>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Optional. Selah works without them; the AI features that use them arrive in a
          later version.
        </p>
        {aiKeys.map((key) => {
          const field = `${key.name}ApiKey` as const;
          return (
            <div key={key.name} className="space-y-2" data-ai-key={key.name} data-source={key.source}>
              <Field
                label={key.label}
                name={field}
                type="password"
                autoComplete="off"
                placeholder={key.source === "saved" ? "Enter a new key to replace it" : undefined}
                error={errors[field]}
                hint={SOURCE_TEXT[key.source](key)}
              />
              {(key.source === "saved" || key.source === "unreadable") && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`${key.name}Remove`} className="size-4" />
                  Remove the saved {key.label}
                </label>
              )}
            </div>
          );
        })}
      </fieldset>

      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
