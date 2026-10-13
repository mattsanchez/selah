import type { ComponentProps, ReactNode } from "react";

const control =
  "h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900";

type FieldProps = {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
};

function Frame({
  label,
  name,
  hint,
  error,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

const described = ({ name, hint, error }: FieldProps) =>
  [error && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(" ") || undefined;

// A labelled text input with its hint and its error.
export function Field({
  label,
  hint,
  error,
  ...input
}: FieldProps & Omit<ComponentProps<"input">, "name" | "id">) {
  const field = { label, name: input.name, hint, error };
  return (
    <Frame {...field}>
      <input
        id={input.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(field)}
        className={control}
        {...input}
      />
    </Frame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: FieldProps & Omit<ComponentProps<"select">, "name" | "id">) {
  const field = { label, name: select.name, hint, error };
  return (
    <Frame {...field}>
      <select
        // After a form action React resets the form, and a select goes back to
        // the option it was first rendered with; remount it so a new default
        // (what was just submitted) is the one selected.
        key={String(select.defaultValue)}
        id={select.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(field)}
        className={control}
        {...select}
      >
        {children}
      </select>
    </Frame>
  );
}

// A message about the whole form.
export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      }
    >
      {children}
    </p>
  );
}
