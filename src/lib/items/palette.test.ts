import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  highlightColor,
  isHighlightColor,
} from "./palette";

// WCAG 2 relative luminance and contrast ratio of "#rrggbb" colors.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// The reader's text colors (.passage-text and .passage-red-letter in
// globals.css), as sRGB: Tailwind's stone-900, red-700, stone-100, red-400.
const TEXT = { light: "#1c1917", dark: "#f5f5f4" };
const RED_LETTER = { light: "#c10007", dark: "#ff6467" };

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const [lightCss, darkCss] = css.split("@media (prefers-color-scheme: dark)");
const property = (block: string, name: string) =>
  block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`))?.[1];

describe("the highlight palette", () => {
  it("is a few named colors with distinct ids", () => {
    expect(HIGHLIGHT_COLORS).toHaveLength(5);
    expect(new Set(HIGHLIGHT_COLORS.map((color) => color.id)).size).toBe(5);
    expect(new Set(HIGHLIGHT_COLORS.map((color) => color.name)).size).toBe(5);
    expect(isHighlightColor(DEFAULT_HIGHLIGHT_COLOR)).toBe(true);
  });

  it("tells its colors from anything else", () => {
    expect(isHighlightColor("yellow")).toBe(true);
    expect(highlightColor("purple")?.name).toBe("Purple");
    for (const other of ["", "Yellow", "red", "#fdf08a", "yellow;", null, undefined, 3]) {
      expect(isHighlightColor(other)).toBe(false);
    }
    expect(highlightColor(null)).toBeUndefined();
  });

  it.each(HIGHLIGHT_COLORS)("$name keeps the reader's text readable", (color) => {
    // 4.5:1 is WCAG AA for body text; the red-letter text is the hard case.
    expect(contrast(color.light, TEXT.light)).toBeGreaterThanOrEqual(7);
    expect(contrast(color.light, RED_LETTER.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.dark, TEXT.dark)).toBeGreaterThanOrEqual(7);
    expect(contrast(color.dark, RED_LETTER.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(HIGHLIGHT_COLORS)("$name is what globals.css paints", (color) => {
    expect(property(lightCss, `hl-${color.id}`)).toBe(color.light);
    expect(property(darkCss, `hl-${color.id}`)).toBe(color.dark);
    expect(property(lightCss, `hl-${color.id}-accent`)).toBe(color.accent);
    for (const attribute of ["data-highlight", "data-highlight-under"]) {
      expect(css).toContain(`[${attribute}="${color.id}"]`);
    }
  });
});
