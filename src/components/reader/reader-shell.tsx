import Link from "next/link";
import type { ReactNode } from "react";

import { getSiteTitle } from "@/lib/site";

import { ReferenceForm } from "./reference-form";

type ReaderShellProps = {
  form: Parameters<typeof ReferenceForm>[0];
  // The parallel view needs more room than a column of prose.
  wide?: boolean;
  // The study panel, when a verse is selected. The page keeps clear of it.
  panel?: ReactNode;
  children?: ReactNode;
};

// The frame the reader and the search page share: the site name and the one
// box for references and searches.
export async function ReaderShell({ form, wide = false, panel, children }: ReaderShellProps) {
  const main = (
    <main className={`mx-auto px-6 py-8 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="font-serif text-2xl tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          {await getSiteTitle()}
        </Link>
        <div className="mt-6">
          <ReferenceForm {...form} />
        </div>
      </div>
      {children}
    </main>
  );
  if (!panel) return main;
  return (
    <>
      {/* Room for the panel: a column on the right, or a sheet at the bottom. */}
      <div className="pb-[55vh] lg:pr-[26rem] lg:pb-0">{main}</div>
      {panel}
    </>
  );
}
