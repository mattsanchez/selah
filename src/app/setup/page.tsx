import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FirstBootSteps, STALLED_MESSAGE } from "@/components/first-boot-status";
import { FormMessage } from "@/components/ui/field";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { DEFAULT_TRANSLATION_ID } from "@/lib/bible/import/sources";
import { listTranslations } from "@/lib/bible/passage";
import { getFirstBootStatus } from "@/lib/first-boot/store";
import { ownerExists } from "@/lib/owner";
import { announceSetupToken } from "@/lib/setup-token-notice";

import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up", robots: { index: false } };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function load() {
  const db = getDb();
  try {
    return {
      hasOwner: await ownerExists(db),
      status: await getFirstBootStatus(db),
      translations: await listTranslations(db, DEFAULT_TRANSLATION_ID),
    };
  } catch {
    return undefined;
  }
}

// The first screen of a new install. While the Bible is still loading it
// shows progress; then it asks for the owner account and the site settings.
// Once an owner exists it is closed for good.
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const state = await load();
  if (state?.hasOwner) redirect("/sign-in");

  const loading = state?.status.state === "running";
  const ready = state !== undefined && !loading && state.translations.length > 0;
  if (ready) announceSetupToken();

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      {/* Progress changes on its own; reload until there is a form to fill in. */}
      {!ready && <meta httpEquiv="refresh" content="5" />}
      <h1 className="font-serif text-4xl tracking-tight">Set up Selah</h1>

      {state === undefined ? (
        <div className="mt-6" data-setup="database">
          <FormMessage kind="error">
            Selah cannot reach its database yet. If it has just started, this page will
            catch up in a moment. Otherwise check that Postgres is running and that
            DATABASE_URL points at it, then look at the server&rsquo;s logs.
          </FormMessage>
        </div>
      ) : !ready ? (
        <div className="mt-6 space-y-5" data-setup={loading ? "loading" : "blocked"}>
          {loading ? (
            <p role="status" className="text-stone-600 dark:text-stone-400">
              Selah is loading the Bible for the first time. This takes a few minutes; the
              page updates by itself, and setup starts when it is done.
            </p>
          ) : state.status.state === "stalled" ? (
            <FormMessage kind="error">{STALLED_MESSAGE}</FormMessage>
          ) : state.status.state === "failed" ? (
            <FormMessage kind="error">
              No translation could be loaded, so setup cannot start yet. What went wrong,
              and how to retry, is below.
            </FormMessage>
          ) : (
            <FormMessage kind="error">
              No translations are loaded yet. With Docker this starts by itself within a
              few seconds. In development, run <code>pnpm db:seed:fixture</code> or{" "}
              <code>pnpm import:bible</code>.
            </FormMessage>
          )}
          {state.status.steps.length > 0 && <FirstBootSteps status={state.status} />}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <p className="text-stone-600 dark:text-stone-400">
            Create the owner account and choose a few settings. This screen is shown once.
          </p>
          {state.status.state !== "done" && state.status.state !== "none" && (
            <div className="space-y-3" data-setup="partial">
              <FormMessage kind="error">
                {state.status.state === "stalled"
                  ? STALLED_MESSAGE
                  : "Not everything could be loaded. You can set up now with what is here; the rest can be retried later."}
              </FormMessage>
              <FirstBootSteps status={state.status} />
            </div>
          )}
          <SetupForm
            translations={state.translations.map(({ id, abbrev, name }) => ({ id, abbrev, name }))}
            defaultTranslationId={DEFAULT_TRANSLATION_ID}
            token={first((await searchParams).token)}
            minPasswordLength={MIN_PASSWORD_LENGTH}
          />
        </div>
      )}
    </main>
  );
}
