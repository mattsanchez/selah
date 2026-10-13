import type { Metadata } from "next";
import Link from "next/link";

import { MAGIC_LINK_MINUTES } from "@/auth";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

// Shown after a sign-in link is asked for, whether or not one was sent.
export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-12">
      <h1 className="font-serif text-4xl tracking-tight">Check your email</h1>
      <p className="mt-6 text-stone-600 dark:text-stone-400">
        If that address is the owner&rsquo;s, a sign-in link is on its way. It works once
        and expires in {MAGIC_LINK_MINUTES} minutes.
      </p>
      <p className="mt-6">
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
