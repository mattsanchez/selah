import type { Editor, Range } from "@tiptap/core";

import { normalizeRanges } from "@/lib/bible/ranges";
import { formatReference, parseReference } from "@/lib/bible/reference";
import type { TranslationInfo } from "@/lib/editor/types";
import { findTranslation } from "@/lib/items/cards";

import type { SlashItem } from "./slash-menu";

// What the "/" menu offers, for what was typed after the slash.

export type BlockContext = {
  // Whether passage blocks can go in this post (a reflection's can).
  passages: boolean;
  translations: readonly TranslationInfo[];
  // The translation a passage typed without one is put in: the one the
  // sidebar is reading.
  translation: () => TranslationInfo | undefined;
  // Asks for an image's address, then inserts it.
  promptImage: () => void;
  // Opens the sidebar to look a passage up, with what was typed.
  lookUp: (query: string) => void;
};

// A reference, with a translation's abbreviation after it or not:
// "john 3:16", "ps 23 kjv". A book alone does not count.
export function typedPassage(
  query: string,
  translations: readonly TranslationInfo[],
): { reference: string; translation?: TranslationInfo } | undefined {
  const text = query.trim();
  // A chapter at least: "/ps" is the start of a word as much as a book.
  if (!/\d/.test(text)) return undefined;
  const named = /^(.*\S)\s+(\S+)$/.exec(text);
  const translation = named ? findTranslation(named[2], translations) : undefined;
  const parsed = parseReference(translation ? named![1] : text);
  if (!parsed.ok) return undefined;
  return { reference: formatReference(normalizeRanges(parsed.ranges)), translation };
}

type Block = Omit<SlashItem, "run"> & { keywords: string; run: (editor: Editor, range: Range) => void };

export function slashItems(query: string, context: BlockContext): SlashItem[] {
  const typed = context.passages ? typedPassage(query, context.translations) : undefined;
  const items: SlashItem[] = [];
  if (typed) {
    const translation = typed.translation ?? context.translation() ?? context.translations[0];
    items.push({
      id: "passage-reference",
      label: `Passage: ${typed.reference}`,
      hint: translation?.abbrev,
      run: (editor, range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertPassage({ reference: typed.reference, translation: translation?.abbrev ?? null })
          .run(),
    });
  }

  const blocks: (Block | false)[] = [
    context.passages && {
      id: "passage",
      label: "Passage",
      hint: "look one up",
      keywords: "passage scripture verse bible reference card",
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        context.lookUp(query.trim());
      },
    },
    {
      id: "heading",
      label: "Heading",
      hint: "##",
      keywords: "heading title h2",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      id: "subheading",
      label: "Subheading",
      hint: "###",
      keywords: "subheading heading h3",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      id: "bullet-list",
      label: "Bulleted list",
      hint: "-",
      keywords: "bulleted list unordered ul",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "ordered-list",
      label: "Numbered list",
      hint: "1.",
      keywords: "numbered list ordered ol",
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "Quote",
      hint: ">",
      keywords: "quote blockquote",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
      id: "separator",
      label: "Separator",
      hint: "---",
      keywords: "separator divider rule line hr",
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: "image",
      label: "Image",
      hint: "from a link",
      keywords: "image picture photo img",
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        context.promptImage();
      },
    },
  ];

  const words = query.trim().toLowerCase();
  for (const block of blocks) {
    if (!block) continue;
    // After a reference: inserting it, or reading it first in the sidebar.
    const shown = typed
      ? block.id === "passage"
      : !words || block.label.toLowerCase().includes(words) || block.keywords.includes(words);
    if (shown) {
      items.push({ id: block.id, label: block.label, hint: block.hint, run: block.run });
    }
  }
  return items;
}
