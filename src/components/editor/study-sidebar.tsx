"use client";

import { Tabs } from "radix-ui";
import { useState, type ComponentType } from "react";

import type { VerseRange } from "@/lib/bible/verse-id";
import type { TranslationInfo } from "@/lib/editor/types";

import { MinePanel } from "./study-mine";
import { ReadPanel } from "./study-read";
import { RelatedPanel } from "./study-related";
import { SearchPanel } from "./study-search";

// The study sidebar beside the post: look up and read passages, search the
// Bible, find what the owner has made, and put any of it in the post.
//
// Each tab is an entry of STUDY_TABS: a label and a panel that gets the
// bridge to the editor. A later tab ("Ask", "Suggest": M11) is one more
// entry; its panel puts passages in the post with
// bridge.insertPassage(reference, translation), as these do.

// What a panel can do with the post, and what it shares with the others.
export type StudyBridge = {
  // Whether passages can go in this post: a reflection's can, a note's not.
  passages: boolean;
  // Every loaded translation, the site's default first, and the one the
  // sidebar reads and searches in.
  translations: TranslationInfo[];
  translationId: string;
  // The ids of those that can be searched by meaning.
  meaningTranslations: string[];
  // The passages in the post as it stands, in order: what "Related" starts from.
  postPassages: () => { reference: string; translation: string | null }[];
  // The post being written, once it is saved; "My content" leaves it out.
  itemId?: string;
  // Puts a passage block in the post where the cursor is.
  insertPassage: (reference: string, translation: string) => void;
  // Puts a link in the text where the cursor is.
  insertLink: (text: string, href: string) => void;
  // Opens "Read" on a passage, with these verses selected.
  read: (reference: string, select?: VerseRange[]) => void;
  // What "Read" was last asked to show.
  reading: ReadRequest;
};

export type ReadRequest = { query: string; select?: VerseRange[]; focus?: boolean; nonce: number };

export type StudyPanelProps = { bridge: StudyBridge; active: boolean };

export type StudyTab = { id: string; label: string; Panel: ComponentType<StudyPanelProps> };

export const STUDY_TABS: StudyTab[] = [
  { id: "read", label: "Read", Panel: ReadPanel },
  { id: "search", label: "Search", Panel: SearchPanel },
  { id: "related", label: "Related", Panel: RelatedPanel },
  { id: "mine", label: "My content", Panel: MinePanel },
];

type StudySidebarProps = {
  bridge: Omit<StudyBridge, "translationId">;
  tab: string;
  onTab: (tab: string) => void;
  // On a phone the sidebar is a sheet over the post; `onClose` closes it.
  sheet: boolean;
  onClose: () => void;
  // The translation chosen to read and search in.
  onTranslation?: (id: string) => void;
};

export function StudySidebar({ bridge, tab, onTab, sheet, onClose, onTranslation }: StudySidebarProps) {
  const [translationId, setTranslationId] = useState(bridge.translations[0]?.id ?? "");
  const full: StudyBridge = { ...bridge, translationId };

  return (
    <Tabs.Root value={tab} onValueChange={onTab} className="flex h-full flex-col font-sans">
      <div className="flex items-center gap-2 border-b border-stone-200 px-3 dark:border-stone-800">
        <Tabs.List aria-label="Study" className="flex min-w-0 flex-1 gap-1">
          {STUDY_TABS.map(({ id, label }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="-mb-px cursor-pointer border-b-2 border-transparent px-2 py-3 text-sm font-medium whitespace-nowrap text-stone-500 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 data-[state=active]:border-stone-900 data-[state=active]:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 dark:data-[state=active]:border-stone-100 dark:data-[state=active]:text-stone-100"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {bridge.translations.length > 1 && (
          <select
            value={translationId}
            onChange={(event) => {
              setTranslationId(event.target.value);
              onTranslation?.(event.target.value);
            }}
            aria-label="Study translation"
            title="The translation to read and search in"
            className="h-8 cursor-pointer rounded-md border border-stone-300 bg-white px-1.5 text-xs font-semibold dark:border-stone-700 dark:bg-stone-900"
          >
            {bridge.translations.map((translation) => (
              <option key={translation.id} value={translation.id}>
                {translation.abbrev}
              </option>
            ))}
          </select>
        )}
        {sheet && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the study sheet"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="m4.6 3.5 3.4 3.4 3.4-3.4 1.1 1.1L9.1 8l3.4 3.4-1.1 1.1L8 9.1l-3.4 3.4-1.1-1.1L6.9 8 3.5 4.6Z" />
            </svg>
          </button>
        )}
      </div>
      {STUDY_TABS.map(({ id, Panel }) => (
        // Kept mounted, so a panel keeps what it shows while another is open.
        <Tabs.Content key={id} value={id} forceMount className="min-h-0 flex-1 focus-visible:outline-none data-[state=inactive]:hidden">
          <Panel bridge={full} active={tab === id} />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
