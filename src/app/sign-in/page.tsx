import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MAGIC_LINK_MINUTES } from "@/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { getOwner, safeNextPath } from "@/lib/auth/owner";
import { magicLinkEnabled } from "@/lib/env";

import { magicLinkAction } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

// Auth.js sends failures here as ?error=<kind>.
const NOTICES: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Ask for a new one.",
  AccessDenied: "That account cannot sign in here.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), "");
  if (await getOwner()) redirect(next || "/");

  const errorKind = first(params.error);
  const notice = errorKind
    ? (NOTICES[errorKind] ?? "Something went wrong signing in. Try again.")
    : undefined;

  return (
    <main className="mx-auto max-w-sm px-6 py-12">
      <h1 className="font-serif text-4xl tracking-tight">Sign in</h1>
      <div className="mt-6">
        <SignInForm next={next || undefined} notice={notice} />
      </div>

      {magicLinkEnabled() && (
        <form
          action={magicLinkAction}
          aria-labelledby="magic-link-heading"
          className="mt-10 space-y-4 border-t border-stone-200 pt-8 dark:border-stone-800"
        >
          <h2 id="magic-link-heading" className="font-serif text-2xl tracking-tight">
            Or get a sign-in link
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            We will email you a link that signs you in without your password. It works once
            and expires in {MAGIC_LINK_MINUTES} minutes.
          </p>
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <label htmlFor="magic-link-email" className="mb-1.5 block text-sm font-medium">
              Email for the link
            </label>
            <input
              id="magic-link-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="h-10 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <SubmitButton>Email me a link</SubmitButton>
        </form>
      )}
    </main>
  );
}
