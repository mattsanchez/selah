"use client";

import type { Editor } from "@tiptap/core";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { useState, type ReactNode } from "react";

import { linkHref } from "@/lib/editor/links";

// The formatting toolbar over selected text, and the "+" beside an empty
// line, which opens the "/" menu.

const button =
  "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded px-2 text-sm font-semibold text-stone-100 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white/20 aria-pressed:text-white dark:text-stone-900 dark:hover:bg-black/10 dark:aria-pressed:bg-black/15";

function Tool({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      // Keep the selection in the editor.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={button}
    >
      {children}
    </button>
  );
}

export function SelectionToolbar({ editor, headings }: { editor: Editor; headings: boolean }) {
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      link: current.isActive("link"),
      href: (current.getAttributes("link").href as string | undefined) ?? "",
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      quote: current.isActive("blockquote"),
    }),
  });

  const applyLink = () => {
    const typed = linking ?? "";
    if (!typed.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinking(null);
      return;
    }
    const href = linkHref(typed);
    if (!href) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinking(null);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: current, state, from, to }) => {
        if (linking !== null) return true;
        if (from === to || !current.isEditable) return false;
        // Text only: not a passage or an image, and not code.
        const { selection } = state;
        if ("node" in selection) return false;
        return !current.isActive("codeBlock");
      }}
      className="selection-toolbar"
    >
      {linking === null ? (
        <div role="toolbar" aria-label="Format" className="flex items-center gap-0.5">
          <Tool label="Bold" pressed={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            B
          </Tool>
          <Tool label="Italic" pressed={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="font-serif italic">i</span>
          </Tool>
          <Tool
            label="Link"
            pressed={active.link}
            onClick={() => {
              setLinkError(false);
              setLinking(active.href);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-current">
              <path d="M6.9 9.1a.75.75 0 0 1 0-1.06l2.12-2.12a.75.75 0 1 1 1.06 1.06L7.96 9.1a.75.75 0 0 1-1.06 0Zm-1.6 3.8-.2.2a2.25 2.25 0 0 1-3.18-3.18l2.3-2.3a2.25 2.25 0 0 1 3.18 0 .75.75 0 0 0 1.06-1.06 3.75 3.75 0 0 0-5.3 0l-2.3 2.3a3.75 3.75 0 0 0 5.3 5.3l.2-.2a.75.75 0 1 0-1.06-1.06Zm5.4-9.8.2-.2a2.25 2.25 0 1 1 3.18 3.18l-2.3 2.3a2.25 2.25 0 0 1-3.18 0 .75.75 0 0 0-1.06 1.06 3.75 3.75 0 0 0 5.3 0l2.3-2.3a3.75 3.75 0 0 0-5.3-5.3l-.2.2a.75.75 0 1 0 1.06 1.06Z" />
            </svg>
          </Tool>
          {headings && (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/25 dark:bg-black/20" />
              <Tool
                label="Heading"
                pressed={active.h2}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                H
              </Tool>
              <Tool
                label="Subheading"
                pressed={active.h3}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <span className="text-xs">H</span>
              </Tool>
            </>
          )}
          <Tool label="Quote" pressed={active.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <span className="font-serif text-lg leading-none">“</span>
          </Tool>
        </div>
      ) : (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <input
            type="text"
            autoFocus
            value={linking}
            onChange={(event) => {
              setLinking(event.target.value);
              setLinkError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setLinking(null);
                editor.commands.focus();
              }
            }}
            aria-label="Link address"
            aria-invalid={linkError || undefined}
            placeholder="Paste or type a link"
            className="h-8 w-60 rounded bg-white/10 px-2 text-sm text-white placeholder:text-stone-400 focus:outline-none aria-invalid:ring-2 aria-invalid:ring-red-400 dark:bg-black/10 dark:text-stone-900"
          />
          <button type="submit" className={button}>
            {linking.trim() ? "Apply" : "Remove"}
          </button>
        </form>
      )}
    </BubbleMenu>
  );
}

// The "+" beside an empty line: opens the "/" menu there.
export function InsertButton({ editor }: { editor: Editor }) {
  return (
    <FloatingMenu
      editor={editor}
      options={{ placement: "left-start", offset: 12 }}
      shouldShow={({ editor: current, state }) => {
        const { $from, empty } = state.selection;
        return (
          current.isEditable &&
          empty &&
          $from.depth === 1 &&
          $from.parent.type.name === "paragraph" &&
          $from.parent.content.size === 0
        );
      }}
    >
      <button
        type="button"
        aria-label="Insert a block"
        title="Insert a block (or type /)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().insertContent("/").run()}
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-stone-300 bg-white text-lg leading-none text-stone-500 hover:border-stone-500 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-500 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:text-stone-100"
      >
        +
      </button>
    </FloatingMenu>
  );
}
