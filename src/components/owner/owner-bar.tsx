import Link from "next/link";

import { signOutAction } from "@/app/sign-in/actions";
import { getOwner } from "@/lib/auth/owner";

const link =
  "rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500";

// A strip across the top of every page, shown only to the signed-in owner.
// Later milestones add the owner's own links (highlights, drafts) here.
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
      className="border-b border-stone-200 bg-stone-100 text-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-x-5 gap-y-1 px-6 py-2">
        <span className="mr-auto text-stone-600 dark:text-stone-400">
          Signed in as {owner.email}
        </span>
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
