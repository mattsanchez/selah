import Link from "next/link";

import { STUDY_PANEL_ID } from "@/components/study/verse-select";

import { AskChat } from "./ask-chat";

export const PANEL_CLASS =
  "fixed inset-x-0 bottom-0 z-20 max-h-[55vh] overflow-y-auto border-t border-stone-300 bg-white px-5 pt-4 pb-8 font-sans shadow-[0_-8px_24px_rgba(0,0,0,0.08)] outline-none lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[26rem] lg:border-t-0 lg:border-l lg:shadow-none dark:border-stone-700 dark:bg-stone-950";

const tab =
  "-mb-px inline-block border-b-2 px-2 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-stone-500";
const on = `${tab} border-stone-900 text-stone-900 dark:border-stone-100 dark:text-stone-100`;
const off = `${tab} border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100`;

// "Study" and "Ask" at the head of the panel. Links, so the panel on show is
// in the address; the conversation keeps in the browser across them.
export function PanelTabs({ current, study, ask }: { current: "study" | "ask"; study: string; ask: string }) {
  return (
    <nav aria-label="Panel" className="mt-3 flex gap-1 border-b border-stone-200 dark:border-stone-800">
      <Link href={study} scroll={false} aria-current={current === "study" ? "page" : undefined} className={current === "study" ? on : off}>
        Study
      </Link>
      <Link href={ask} scroll={false} aria-current={current === "ask" ? "page" : undefined} className={current === "ask" ? on : off}>
        Ask
      </Link>
    </nav>
  );
}

type ReaderAskPanelProps = {
  // What is asked about: the selected verses, or else the passage.
  reference: string;
  translationId: string;
  closeHref: string;
  // The study panel of the selection, when there is one.
  studyHref?: string;
  askHref: string;
};

// The panel the reader opens beside the passage for asking about it: in the
// place of the study panel, and only ever for the owner.
export function ReaderAskPanel({ reference, translationId, closeHref, studyHref, askHref }: ReaderAskPanelProps) {
  return (
    <aside id={STUDY_PANEL_ID} tabIndex={-1} aria-labelledby="study-title" data-ask-panel className={PANEL_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">Ask about</p>
          <h2 id="study-title" className="font-serif text-2xl tracking-tight">
            {reference}
          </h2>
        </div>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close the panel"
          className="rounded-md border border-stone-300 px-2.5 py-1 text-sm text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Close
        </Link>
      </div>
      {/* Without a selection there is no study to go back to. */}
      {studyHref && <PanelTabs current="ask" study={studyHref} ask={askHref} />}
      <div className="mt-4">
        <AskChat reference={reference} translation={translationId} />
      </div>
    </aside>
  );
}
