import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FirstBootSteps, STALLED_MESSAGE } from "@/components/first-boot-status";
import { FormMessage } from "@/components/ui/field";
import { getDb } from "@/db/client";
import { AI_KEY_NAMES, AI_KEYS, getAiKeySources } from "@/lib/ai/keys";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { getFirstBootStatus } from "@/lib/first-boot/store";
import { getSite } from "@/lib/site";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

// The owner's settings: what setup asked for, changeable later.
export default async function SettingsPage() {
  const owner = await requireOwner("/settings");
  const db = getDb();
  const site = await getSite();
  if (!site) redirect("/setup");

  const [translations, sources, firstBoot] = await Promise.all([
    listTranslations(db, site.defaultTranslationId),
    getAiKeySources(),
    getFirstBootStatus(db),
  ]);

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href="/"
        className="font-serif text-2xl tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
      >
        {site.title}
      </Link>
      <h1 className="mt-8 font-serif text-4xl tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        Signed in as {owner.email}.
      </p>

      <div className="mt-8">
        <SettingsForm
          site={{
            title: site.title,
            handle: site.handle,
            defaultTranslationId: site.defaultTranslationId,
          }}
          translations={translations.map(({ id, abbrev, name }) => ({ id, abbrev, name }))}
          aiKeys={AI_KEY_NAMES.map((name) => ({
            name,
            label: AI_KEYS[name].label,
            env: AI_KEYS[name].env,
            source: sources[name],
          }))}
        />
      </div>

      {firstBoot.state !== "none" && (
        <section aria-labelledby="data-heading" className="mt-12 space-y-4">
          <h2 id="data-heading" className="font-serif text-2xl tracking-tight">
            Bible data
          </h2>
          {firstBoot.state === "stalled" && (
            <FormMessage kind="error">{STALLED_MESSAGE}</FormMessage>
          )}
          <FirstBootSteps status={firstBoot} />
        </section>
      )}
    </main>
  );
}
