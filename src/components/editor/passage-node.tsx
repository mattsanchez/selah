"use client";

import { Node, type Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";

import { Attribution, PassageQuote } from "@/components/passage/passage";
import { findTranslation } from "@/lib/items/cards";
import type { EditorNode, PassageAttrs } from "@/lib/items/editor-document";
import type { TranslationInfo } from "@/lib/editor/types";

import { fetchPassage, usePassage } from "./passages";

// A passage in a post: a block that prints the verses as the reader will see
// them, and is stored as a card, `[[John 3:16-18 | KJV]]`, on a line of its
// own (src/lib/items/editor-document.ts). It is one unit: selected, dragged,
// moved, deleted and undone whole. Its translation can be changed in place.
//
// Cards are only read at the top level of a reflection, so a passage block
// sits only there: the document is "(block | passage)+" and nothing else
// takes a passage.
//
// To put one in a post from code:
//
//   editor.commands.insertPassage({ reference: "John 3:16-18", translation: "KJV" })
//
// It goes where the cursor is: in place of an empty paragraph, between the
// halves of a paragraph it splits, or after the list or quote the cursor is
// in; the cursor ends up in the paragraph after it.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    passage: {
      insertPassage: (passage: { reference: string; translation?: string | null }) => ReturnType;
      // A quote and its credit, as quoteNode() in src/lib/ask/quote.ts makes it.
      insertQuote: (quote: EditorNode) => ReturnType;
    };
  }
}

// Puts a block where the cursor is, as above.
function placeBlock(state: EditorState, tr: Transaction, node: PmNode) {
  // Its own step of Undo, apart from what was typed just before.
  closeHistory(tr);
  const { selection } = state;
  const { $from } = selection;
  // Where it goes.
  let at: number;
  if ($from.depth === 0) {
    // A block is selected (or the cursor is between two): after it.
    at = selection instanceof NodeSelection ? selection.to : $from.pos;
    tr.insert(at, node);
  } else {
    const top = $from.node(1);
    const start = $from.before(1);
    const inTop = $from.depth === 1 && top.isTextblock;
    at = start;
    if (top.type.name === "paragraph" && top.content.size === 0) {
      // In place of an empty paragraph.
      tr.replaceWith(start, $from.after(1), node);
    } else if (inTop && $from.parentOffset === 0) {
      tr.insert(start, node);
    } else if (inTop && $from.parentOffset < top.content.size) {
      // Between the halves of the paragraph.
      tr.split($from.pos);
      at = $from.pos + 1;
      tr.insert(at, node);
    } else {
      // After the paragraph, list or quote.
      at = $from.after(1);
      tr.insert(at, node);
    }
  }

  // The cursor goes into the text after the block, which there always is.
  const after = at + node.nodeSize;
  if (!tr.doc.resolve(after).nodeAfter?.isTextblock) {
    tr.insert(after, state.schema.nodes.paragraph.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
}

export type PassageOptions = {
  // Every loaded translation, the site's default first.
  translations: TranslationInfo[];
};

// The top of the document: blocks, and passages between them.
export const PostDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "(block | passage)+",
});

export const PassageNode = Node.create<PassageOptions>({
  name: "passage",
  group: "passage",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { translations: [] };
  },

  addAttributes() {
    return {
      reference: { default: "" },
      translation: { default: null },
      source: { default: null },
    };
  },

  // How a block is copied and pasted, inside the editor or between posts.
  parseHTML() {
    return [
      {
        tag: "figure[data-passage-block]",
        getAttrs: (element) => ({
          reference: element.getAttribute("data-reference") ?? "",
          translation: element.getAttribute("data-translation") || null,
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "figure",
      {
        "data-passage-block": "",
        "data-reference": node.attrs.reference,
        "data-translation": node.attrs.translation ?? "",
      },
      `[[${node.attrs.reference}]]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PassageView);
  },

  addCommands() {
    return {
      insertPassage:
        ({ reference, translation = null }) =>
        ({ state, tr }) => {
          placeBlock(state, tr, state.schema.nodes.passage.create({ reference, translation, source: null }));
          return true;
        },
      insertQuote:
        (quote) =>
        ({ state, tr }) => {
          placeBlock(state, tr, state.schema.nodeFromJSON(quote));
          return true;
        },
    };
  },
});

const iconButton =
  "inline-flex size-7 cursor-pointer items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 disabled:cursor-default disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// Moves the passage at `pos` one block up or down.
function move(editor: Editor, pos: number, node: PmNode, by: -1 | 1) {
  const { doc } = editor.state;
  const index = doc.resolve(pos).index(0);
  const sibling = doc.maybeChild(index + by);
  if (!sibling) return;
  const tr = closeHistory(editor.state.tr);
  if (by < 0) {
    const to = pos - sibling.nodeSize;
    tr.delete(pos, pos + node.nodeSize).insert(to, node);
    tr.setSelection(NodeSelection.create(tr.doc, to));
  } else {
    tr.insert(pos + node.nodeSize + sibling.nodeSize, node).delete(pos, pos + node.nodeSize);
    tr.setSelection(NodeSelection.create(tr.doc, pos + sibling.nodeSize));
  }
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}

function PassageView({ node, editor, getPos, selected, updateAttributes, deleteNode, extension }: ReactNodeViewProps) {
  const attrs = node.attrs as PassageAttrs;
  const { translations } = extension.options as PassageOptions;
  const data = usePassage(attrs.reference, attrs.translation, "card");
  const chosen = findTranslation(attrs.translation ?? undefined, translations) ?? translations[0];
  const label = data?.ok ? data.reference : attrs.reference;
  const pos = typeof getPos === "function" ? getPos() : undefined;
  const index = pos === undefined ? 0 : editor.state.doc.resolve(pos).index(0);
  const last = editor.state.doc.childCount - 1;

  return (
    <NodeViewWrapper
      as="figure"
      data-passage-block={label}
      data-translation={data?.ok ? data.translation.id : (chosen?.id ?? "")}
      data-selected={selected ? "" : undefined}
      aria-label={`Passage: ${label}`}
      className="passage-block group"
    >
      <div contentEditable={false} suppressContentEditableWarning>
        <div
          className="passage-block-tools"
          role="toolbar"
          aria-label={`Passage ${label}`}
        >
          <button
            type="button"
            data-drag-handle
            draggable
            aria-label="Drag to move"
            title="Drag to move"
            className={`${iconButton} cursor-grab`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="M6 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm-1.25 5.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM12.5 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM11.25 9.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm1.25 3.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" />
            </svg>
          </button>
          {translations.length > 1 && (
            <select
              aria-label="Translation"
              value={chosen?.id ?? ""}
              onChange={(event) => {
                const next = translations.find((translation) => translation.id === event.target.value);
                if (next) updateAttributes({ translation: next.abbrev, source: null });
                void fetchPassage(attrs.reference, next?.abbrev, "card");
              }}
              className="h-7 cursor-pointer rounded border-0 bg-transparent px-1 font-sans text-xs font-semibold text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-500 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {translations.map((translation) => (
                <option key={translation.id} value={translation.id}>
                  {translation.abbrev}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-label="Move up"
            title="Move up"
            disabled={index === 0}
            onClick={() => pos !== undefined && move(editor, pos, node, -1)}
            className={iconButton}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="M8 3.5 3.5 8l1 1L7.3 6.2V12.5h1.4V6.2L11.5 9l1-1Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Move down"
            title="Move down"
            disabled={index === last}
            onClick={() => pos !== undefined && move(editor, pos, node, 1)}
            className={iconButton}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="M8 12.5 3.5 8l1-1 2.8 2.8V3.5h1.4v6.3L11.5 7l1 1Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Remove passage"
            title="Remove"
            onClick={() => {
              if (pos !== undefined) {
                editor.view.dispatch(closeHistory(editor.state.tr.delete(pos, pos + node.nodeSize)));
              } else {
                deleteNode();
              }
              // The button was inside the editor and is gone: focus goes
              // back to the text, where Undo brings the passage back.
              editor.view.focus();
            }}
            className={iconButton}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="m4.6 3.5 3.4 3.4 3.4-3.4 1.1 1.1L9.1 8l3.4 3.4-1.1 1.1L8 9.1l-3.4 3.4-1.1-1.1L6.9 8 3.5 4.6Z" />
            </svg>
          </button>
        </div>

        {!data ? (
          <p className="passage-block-status">Loading {attrs.reference}…</p>
        ) : !data.ok ? (
          <p role="alert" data-bad-passage className="passage-block-error">
            <code>{attrs.source ?? `[[${attrs.reference}]]`}</code> {data.error}
          </p>
        ) : (
          <>
            <blockquote>
              <PassageQuote ranges={data.verses} />
              {data.more && <p className="mt-2 font-sans text-sm text-stone-500 dark:text-stone-400">…</p>}
            </blockquote>
            <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-2 font-sans text-sm text-stone-600 dark:text-stone-400">
              <span className="font-medium text-stone-900 dark:text-stone-100">{data.reference}</span>
              <span data-card-translation={data.translation.id}>{data.translation.abbrev}</span>
              {data.more && <span>The card links to the rest.</span>}
            </figcaption>
            <div className="mt-1">
              <Attribution translation={data.translation} />
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
