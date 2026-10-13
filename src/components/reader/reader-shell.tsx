import Link from "next/link";
import type { ReactNode } from "react";

import { ReferenceForm } from "./reference-form";

type ReaderShellProps = {
  form: Parameters<typeof ReferenceForm>[0];
  // The parallel view needs more room than a column of prose.
  wide?: boolean;
  children?: ReactNode;
};

// The frame every reader page shares: the site name and the reference box.
export function ReaderShell({ form, wide = false, children }: ReaderShellProps) {
  return (
    <main className={`mx-auto px-6 py-8 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="font-serif text-2xl tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
        >
          Selah
        </Link>
        <div className="mt-6">
          <ReferenceForm {...form} />
        </div>
      </div>
      {children}
    </main>
  );
}
