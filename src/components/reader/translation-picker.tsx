"use client";

import { useRouter } from "next/navigation";
import { ToggleGroup } from "radix-ui";
import { useTransition } from "react";

import { MAX_TRANSLATIONS, translationParam } from "@/lib/reader-url";

type TranslationPickerProps = {
  translations: readonly { id: string; abbrev: string; name: string }[];
  // The translations on show, in column order.
  selected: readonly string[];
  defaultId: string;
  // The passage's path, without the `t` parameter.
  path: string;
  // The rest of the query to keep across a choice, such as "v=john-3.16".
  keep?: string;
};

// Chooses which translations the reader shows: one for the plain reader, two
// to four for the parallel view. Each choice is a navigation, so the URL
// always says what is on screen.
export function TranslationPicker({
  translations,
  selected,
  defaultId,
  path,
  keep,
}: TranslationPickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const full = selected.length >= MAX_TRANSLATIONS;

  function choose(next: string[]) {
    // At least one, and new choices go on the right.
    if (next.length === 0 || next.length > MAX_TRANSLATIONS) return;
    const ordered = [
      ...selected.filter((id) => next.includes(id)),
      ...next.filter((id) => !selected.includes(id)),
    ];
    const t = translationParam(ordered, defaultId);
    const query = [t && `t=${t}`, keep].filter(Boolean).join("&");
    startTransition(() => router.push(query ? `${path}?${query}` : path, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span id="translation-picker-label" className="text-sm font-medium">
        Translations
      </span>
      <ToggleGroup.Root
        type="multiple"
        value={[...selected]}
        onValueChange={choose}
        aria-labelledby="translation-picker-label"
        aria-busy={pending || undefined}
        className="inline-flex rounded-md border border-stone-300 bg-white p-0.5 dark:border-stone-700 dark:bg-stone-900"
      >
        {translations.map((translation) => (
          <ToggleGroup.Item
            key={translation.id}
            value={translation.id}
            title={translation.name}
            aria-label={translation.name}
            disabled={full && !selected.includes(translation.id)}
            className="h-8 rounded px-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-500 disabled:opacity-40 data-[state=on]:bg-stone-900 data-[state=on]:text-stone-50 dark:text-stone-300 dark:hover:bg-stone-800 dark:data-[state=on]:bg-stone-100 dark:data-[state=on]:text-stone-900"
          >
            {translation.abbrev}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <span className="text-sm text-stone-500 dark:text-stone-400">
        {selected.length > 1
          ? `Comparing ${selected.length} side by side.`
          : `Choose up to ${MAX_TRANSLATIONS} to compare.`}
      </span>
    </div>
  );
}
