import Link from "next/link";

import { signOutAction } from "@/app/sign-in/actions";
import { getOwner } from "@/lib/auth/owner";
import { writePath } from "@/lib/items-url";

const link =
  "rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

// A strip across the top of every page, shown only to the signed-in owner,
// with the owner's own pages ("My items" is every highlight, reflection and
// note, drafts included) and, first, writing: "New post" and "New note" open
// the editor. It is hidden while the editor is open (globals.css).
export async function OwnerBar() {
  let owner;
  try {
    owner = await getOwner();
  } catch {
    // No database, no session to check: render the page without the bar.
    return null;
  }
  if (!owner) return null;

  return (
    <nav
      aria-label="Owner"
      data-owner-bar
      className="border-b border-stone-200 bg-stone-100 text-sm dark:border-stone-800 dark:bg-stone-900"
    >
      {/* Kept to the left: on a wide screen the reader's study panel is fixed
          over the right-hand side of the page, this bar included. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2">
        <Link
          href={writePath()}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-stone-900 px-3 font-medium text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-current">
            <path d="M11.5 1.8a1.6 1.6 0 0 1 2.3 0l.4.4a1.6 1.6 0 0 1 0 2.3l-7.9 7.9-3.3.9.9-3.3Z" />
          </svg>
          New post
        </Link>
        <Link href={writePath({ kind: "note" })} className={link}>
          New note
        </Link>
        <span className="text-stone-600 dark:text-stone-400">
          Signed in as {owner.email}
        </span>
        <Link href="/highlights" className={link}>
          My highlights
        </Link>
        <Link href="/items" className={link}>
          My items
        </Link>
        <Link href="/settings" className={link}>
          Settings
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={`cursor-pointer ${link}`}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
