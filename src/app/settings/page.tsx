import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FirstBootSteps, STALLED_MESSAGE } from "@/components/first-boot-status";
import { FormMessage } from "@/components/ui/field";
import { getDb } from "@/db/client";
import { AI_KEY_NAMES, AI_KEYS, getAiKeySources } from "@/lib/ai/keys";
import { loadAiProvider } from "@/lib/ai/load";
import { countAnswers, dailyCap, questionsUsed } from "@/lib/ask/store";
import { requireOwner } from "@/lib/auth/owner";
import { listTranslations } from "@/lib/bible/passage";
import { getEmbeddingStatus } from "@/lib/embeddings/job";
import { getFirstBootStatus } from "@/lib/first-boot/store";
import { getSite } from "@/lib/site";

import { AskSettings } from "./ask-settings";
import { EmbeddingPanel } from "./embedding-panel";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

// The owner's settings: what setup asked for, changeable later.
export default async function SettingsPage() {
  const owner = await requireOwner("/settings");
  const db = getDb();
  const site = await getSite();
  if (!site) redirect("/setup");

  const provider = await loadAiProvider();
  const [translations, sources, firstBoot, embeddings, used, savedAnswers] = await Promise.all([
    listTranslations(db, site.defaultTranslationId),
    getAiKeySources(),
    getFirstBootStatus(db),
    getEmbeddingStatus(db, provider, { defaultId: site.defaultTranslationId }),
    questionsUsed(db),
    countAnswers(db),
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

      <section aria-labelledby="ask-heading" className="mt-12 space-y-4">
        <h2 id="ask-heading" className="font-serif text-2xl tracking-tight">
          Ask
        </h2>
        <AskSettings
          on={provider.answerModel !== null}
          keySet={sources.anthropic === "environment" || sources.anthropic === "saved"}
          cap={dailyCap(site.settings)}
          used={used}
          savedAnswers={savedAnswers}
        />
      </section>

      <section aria-labelledby="meaning-heading" className="mt-12 space-y-4">
        <h2 id="meaning-heading" className="font-serif text-2xl tracking-tight">
          Meaning search
        </h2>
        <EmbeddingPanel status={embeddings} />
      </section>

      <section aria-labelledby="export-heading" className="mt-12 space-y-3">
        <h2 id="export-heading" className="font-serif text-2xl tracking-tight">
          Your data
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Every highlight, note and reflection, as one JSON file and a Markdown file for each.
        </p>
        <a
          href="/export"
          className="inline-flex h-10 items-center rounded-md border border-stone-300 px-4 text-sm font-medium hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Export everything
        </a>
      </section>

      {firstBoot.state !== "none" && (
        <section aria-labelledby="data-heading" className="mt-12 space-y-4">
          <h2 id="data-heading" className="font-serif text-2xl tracking-tight">
            Bible and study data
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
