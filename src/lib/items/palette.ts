// The colors a highlight can have: a small fixed palette. `id` is what the
// `color` column of `item` stores and what the `data-highlight` attribute
// carries; `light` and `dark` are the background the verse gets on the
// reader's light and dark themes, and `accent` is the stronger tone of
// swatches and of the edge of a card.
//
// The colors themselves are CSS custom properties (`--hl-yellow`, `--hl-yellow-accent`, ...) in
// src/app/globals.css, which a test keeps equal to this list. Each is light
// (or dark) enough that the reader's text, its red-letter text included,
// keeps a contrast of at least 4.5:1 on it.
export const HIGHLIGHT_COLORS = [
  { id: "yellow", name: "Yellow", accent: "#eab308", light: "#fdf08a", dark: "#382c04" },
  { id: "green", name: "Green", accent: "#22c55e", light: "#c3f5d0", dark: "#0c331d" },
  { id: "blue", name: "Blue", accent: "#3b82f6", light: "#cfe3fe", dark: "#152b51" },
  { id: "pink", name: "Pink", accent: "#ec4899", light: "#fcd9ec", dark: "#521938" },
  { id: "purple", name: "Purple", accent: "#a855f7", light: "#eadcfd", dark: "#3a2160" },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export type HighlightColorId = HighlightColor["id"];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColorId = "yellow";

export function highlightColor(id: string | null | undefined): HighlightColor | undefined {
  return HIGHLIGHT_COLORS.find((color) => color.id === id);
}

export const isHighlightColor = (id: unknown): id is HighlightColorId =>
  typeof id === "string" && highlightColor(id) !== undefined;
