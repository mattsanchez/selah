import Link from "next/link";

import { Masthead } from "@/components/site/masthead";

// A permalink, tag or passage that is not there, or not for this visitor:
// a private item is not found for anyone but its owner.
export default function NotFound() {
  return (
    <>
      <Masthead />
      <main className="site-main">
        <div className="site-column site-page-header">
          <h1 className="site-page-title">Not found</h1>
          <p className="mt-4 font-sans text-stone-600 dark:text-stone-400">
            There is nothing at this address.{" "}
            <Link href="/" className="underline underline-offset-4">
              Go to the front page
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
