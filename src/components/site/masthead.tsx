import Link from "next/link";

import { getSiteTitle } from "@/lib/site";

const nav =
  "rounded-sm underline-offset-4 hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:hover:text-stone-100";

// The head of every public page: the site's title, which is the page's
// heading on the front page and a link home everywhere else, and the way
// into the Bible.
export async function Masthead({ home = false }: { home?: boolean }) {
  const title = await getSiteTitle();
  const Title = home ? "h1" : "p";
  return (
    <header className="site-masthead">
      <div className="site-column">
        <Title className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          <Link href="/" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-500">
            {title}
          </Link>
        </Title>
        <nav
          aria-label="Site"
          className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-sm text-stone-600 dark:text-stone-400"
        >
          <Link href="/read" className={nav}>
            Read the Bible
          </Link>
          <Link href="/search" className={nav}>
            Search the Bible
          </Link>
        </nav>
      </div>
    </header>
  );
}
