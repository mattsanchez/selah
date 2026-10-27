"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useId, useRef, useState } from "react";

// The "/" menu: typing "/" at the start of a line or after a space lists
// the blocks that can go there, and what follows the slash narrows the list.
// A reference ("/john 3:16", "/ps 23 kjv") offers that passage first.

export type SlashItem = {
  id: string;
  label: string;
  // Shown after the label, quieter: what it is, or its shortcut.
  hint?: string;
  run: (editor: Editor, range: Range) => void;
};

export type SlashState = {
  items: SlashItem[];
  clientRect: (() => DOMRect | null) | null | undefined;
  command: (item: SlashItem) => void;
};

export type SlashOptions = {
  items: (query: string, editor: Editor) => SlashItem[];
  // The menu to show, or null to hide it.
  onChange: (state: SlashState | null) => void;
  // A key pressed while the menu is open; true when the menu used it.
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const SlashCommands = Extension.create<SlashOptions>({
  name: "slashCommands",

  addOptions() {
    return { items: () => [], onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const show = (props: SuggestionProps<SlashItem, SlashItem>) =>
      this.options.onChange({ items: props.items, clientRect: props.clientRect, command: props.command });
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: true,
        // Not in code, where a slash is a slash.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query, editor }) => this.options.items(query, editor),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: show,
          onUpdate: show,
          onKeyDown: ({ event }) => this.options.onKeyDown(event),
          onExit: () => this.options.onChange(null),
        }),
      }),
    ];
  },
});

// The menu's state: what is listed, which item is active, and the keys the
// extension hands over while it is open (arrows, Enter or Tab, Escape).
// `handlers` go to SlashCommands.configure(); they never change.
export function useSlashMenu() {
  const [state, setState] = useState<SlashState | null>(null);
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState<SlashState | null>(null);
  const live = useRef({ state, index, closed });
  useEffect(() => {
    live.current = { state, index, closed };
  });

  const [handlers] = useState(() => ({
    onChange: (next: SlashState | null) => {
      live.current = { ...live.current, state: next, index: 0 };
      setState(next);
      setIndex(0);
    },
    onKeyDown: (event: KeyboardEvent): boolean => {
      const { state: current, index: at, closed: shut } = live.current;
      const items = current?.items ?? [];
      if (!current || current === shut || items.length === 0) return false;
      const move = (to: number) => {
        live.current = { ...live.current, index: to };
        setIndex(to);
      };
      if (event.key === "ArrowDown") {
        move((at + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        move((at - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        current.command(items[Math.min(at, items.length - 1)]);
        return true;
      }
      if (event.key === "Escape") {
        live.current = { ...live.current, closed: current };
        setClosed(current);
        return true;
      }
      return false;
    },
  }));

  const open = state !== null && state !== closed && state.items.length > 0;
  return { state: open ? state : null, index, setIndex, handlers };
}

// The menu itself, at the slash.
export function SlashMenu({
  state,
  index,
  onHover,
}: {
  state: SlashState | null;
  index: number;
  onHover: (index: number) => void;
}) {
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const active = Math.min(index, Math.max((state?.items.length ?? 1) - 1, 0));

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const rect = state?.clientRect?.();
  if (!state || !rect) return null;
  const below = rect.bottom + 8;
  const up = below + 320 > window.innerHeight && rect.top > 340;
  return (
    <div
      className="slash-menu"
      style={{
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
        ...(up ? { bottom: window.innerHeight - rect.top + 8 } : { top: below }),
      }}
    >
      <ul ref={list} id={listId} role="listbox" aria-label="Insert" className="max-h-80 overflow-y-auto p-1">
        {state.items.map((item, i) => (
          <li
            key={item.id}
            role="option"
            data-index={i}
            data-slash-item={item.id}
            aria-selected={i === active}
            onMouseDown={(event) => {
              // Keep the editor's focus and selection.
              event.preventDefault();
              state.command(item);
            }}
            onMouseEnter={() => onHover(i)}
            className="flex cursor-pointer items-baseline justify-between gap-4 rounded-md px-3 py-2 text-sm aria-selected:bg-stone-100 dark:aria-selected:bg-stone-800"
          >
            <span className="font-medium text-stone-900 dark:text-stone-100">{item.label}</span>
            {item.hint && <span className="truncate text-xs text-stone-500 dark:text-stone-400">{item.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
