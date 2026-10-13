import { Button } from "@/components/ui/button";

type ReferenceFormProps = {
  // What the box starts with: the passage on show, or what was last typed.
  value?: string;
  // The `t` parameter to keep across a lookup, so the translations stay chosen.
  t?: string;
  // Why the last lookup failed.
  error?: string;
};

// The one box of the reader and the search page: a reference opens the
// passage, anything else searches the text. A plain GET form to /search, so
// it works without JavaScript; /search tells the two apart (interpretQuery in
// src/lib/search-url.ts) and redirects a reference to the passage.
export function ReferenceForm({ value = "", t, error }: ReferenceFormProps) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Look up a passage or search the Bible"
    >
      <label htmlFor="reference" className="mb-1.5 block text-sm font-medium">
        Passage or search
      </label>
      <div className="flex gap-2">
        <input
          id="reference"
          name="q"
          type="text"
          defaultValue={value}
          placeholder="John 3:16-21 or living water"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reference-error" : "reference-hint"}
          className="h-10 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-base shadow-xs placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 aria-invalid:border-red-600 dark:border-stone-700 dark:bg-stone-900"
        />
        {t && <input type="hidden" name="t" value={t} />}
        <Button type="submit">Go</Button>
      </div>
      {error ? (
        <p
          id="reference-error"
          role="alert"
          className="mt-2 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      ) : (
        <p id="reference-hint" className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          A reference opens the passage: <kbd className="font-sans">John 3:16-21</kbd>,{" "}
          <kbd className="font-sans">jn3.16</kbd>, <kbd className="font-sans">Ps 23</kbd>. Anything
          else searches the text: <kbd className="font-sans">living water</kbd>,{" "}
          <kbd className="font-sans">“good shepherd”</kbd>.
        </p>
      )}
    </form>
  );
}
