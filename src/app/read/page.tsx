import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReaderShell } from "@/components/reader/reader-shell";
import { parseReference } from "@/lib/bible/reference";
import { readerPath } from "@/lib/reader-url";
import { interpretQuery, searchPath } from "@/lib/search-url";

export const metadata: Metadata = { title: "Read" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const EXAMPLES = ["John 3:16-21", "Psalm 23", "Romans 8:28-39"];

// The box on its own. It submits to /search, but /read?q=jn3.16 still works:
// it redirects to the passage's own URL, or shows why the reference was not
// understood. Words that are not a reference go on to the search page.
export default async function ReadPage({ searchParams }: PageProps<"/read">) {
  const params = await searchParams;
  const q = first(params.q)?.trim();
  // Checked against the loaded translations by the passage page.
  const t = first(params.t)?.match(/^[a-z0-9_,-]+$/i)?.[0];

  const intent = interpretQuery(q ?? "");
  if (intent.kind === "reference") redirect(readerPath(intent.ranges, t));
  if (intent.kind === "keyword") redirect(searchPath({ q: q!, t }));

  return (
    <ReaderShell
      form={{ value: q, t, error: intent.kind === "bad-reference" ? intent.message : undefined }}
    >
      <div className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight">Read the Bible</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Type a reference above, or words to search for. Or start with one of these:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => {
            const reference = parseReference(example);
            return reference.ok ? (
              <li key={example}>
                <Link
                  href={readerPath(reference.ranges, t)}
                  className="inline-flex h-9 items-center rounded-md border border-stone-300 px-3 text-sm hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:hover:bg-stone-900"
                >
                  {example}
                </Link>
              </li>
            ) : null;
          })}
        </ul>
      </div>
    </ReaderShell>
  );
}
