import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getOwner } from "@/lib/auth/owner";
import { getSiteTitle } from "@/lib/site";

export default async function HomePage() {
  const title = await getSiteTitle();
  const owner = await getOwner().catch(() => null);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-serif text-5xl tracking-tight">{title}</h1>
      <p className="text-lg text-stone-600 dark:text-stone-400">
        A self-hostable, open source lifestream for daily Bible reading.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild>
          <Link href="/read">Read the Bible</Link>
        </Button>
        <Link
          href="/search"
          className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          Search the Bible
        </Link>
        <a
          href="https://github.com/mattsanchez/selah"
          className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          View the project
        </a>
        {!owner && (
          <Link
            href="/sign-in"
            className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
