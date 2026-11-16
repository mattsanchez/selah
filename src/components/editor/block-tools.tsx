"use client";

import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";

// The small toolbar over a block that is one unit in the post (a passage, a
// quote): drag, move up or down, remove. Each change is its own step of Undo.

const iconButton =
  "inline-flex size-7 cursor-pointer items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 disabled:cursor-default disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// Moves the block at `pos` one block up or down.
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

export function BlockTools({
  editor,
  node,
  getPos,
  deleteNode,
  label,
  removeLabel,
  children,
}: {
  editor: Editor;
  node: PmNode;
  getPos: (() => number | undefined) | boolean;
  deleteNode: () => void;
  // The toolbar's name: "Passage John 3:16".
  label: string;
  // "Remove passage".
  removeLabel: string;
  // Controls of the block's own, after the drag handle.
  children?: ReactNode;
}) {
  // Where the block is now: read on every change to the post, since a block
  // moves when others do, and again on each click.
  const position = () => (typeof getPos === "function" ? getPos() : undefined);
  const { index, last } = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const at = position();
      return {
        index: at === undefined ? 0 : current.state.doc.resolve(at).index(0),
        last: current.state.doc.childCount - 1,
      };
    },
  });

  return (
    <div className="passage-block-tools" role="toolbar" aria-label={label}>
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
      {children}
      <button
        type="button"
        aria-label="Move up"
        title="Move up"
        disabled={index === 0}
        onClick={() => {
          const pos = position();
          if (pos !== undefined) move(editor, pos, editor.state.doc.nodeAt(pos) ?? node, -1);
        }}
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
        onClick={() => {
          const pos = position();
          if (pos !== undefined) move(editor, pos, editor.state.doc.nodeAt(pos) ?? node, 1);
        }}
        className={iconButton}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
          <path d="M8 12.5 3.5 8l1-1 2.8 2.8V3.5h1.4v6.3L11.5 7l1 1Z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={removeLabel}
        title="Remove"
        onClick={() => {
          const pos = position();
          if (pos !== undefined) {
            editor.view.dispatch(closeHistory(editor.state.tr.delete(pos, pos + node.nodeSize)));
          } else {
            deleteNode();
          }
          // The button was inside the editor and is gone: focus goes
          // back to the text, where Undo brings the block back.
          editor.view.focus();
        }}
        className={iconButton}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
          <path d="m4.6 3.5 3.4 3.4 3.4-3.4 1.1 1.1L9.1 8l3.4 3.4-1.1 1.1L8 9.1l-3.4 3.4-1.1-1.1L6.9 8 3.5 4.6Z" />
        </svg>
      </button>
    </div>
  );
}
