import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { HIGHLIGHT_COLORS, type HighlightColor } from "@/lib/items/palette";

import { drawable, fontCharacters } from "./cmap";

// The Open Graph images of the public site, 1200 × 630: what a link to a
// page looks like where it is shared.
//
// - a verse: a shared highlight, or a note on a passage, previews as the
//   verses themselves, with their reference and translation, and a
//   highlight's color as the accent and the wash behind them;
// - an article: a reflection's title and its first words;
// - a page: the site, a tag or a passage page's name.
//
// Drawn in Source Serif 4, the public theme's type (src/fonts, SIL Open
// Font License), read from disk: rendering makes no request to anything but
// this app (see ./cmap.ts for the characters it leaves out). next.config.ts
// puts the font files in the standalone build.

export const OG_SIZE = { width: 1200, height: 630 };

const FONT_DIR = path.join(process.cwd(), "src", "fonts", "source-serif-4");

type Fonts = {
  fonts: { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[];
  characters: Set<number>;
};

let loading: Promise<Fonts> | undefined;

function loadFonts(): Promise<Fonts> {
  loading ??= (async () => {
    const [regular, semibold] = await Promise.all(
      ["SourceSerif4-Regular.ttf", "SourceSerif4-Semibold.ttf"].map((file) =>
        readFile(path.join(FONT_DIR, file)),
      ),
    );
    const buffer = (data: Buffer) =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    // What both weights can draw.
    const characters = fontCharacters(regular);
    const bold = fontCharacters(semibold);
    for (const code of characters) if (!bold.has(code)) characters.delete(code);
    return {
      fonts: [
        { name: "Source Serif 4", data: buffer(regular), weight: 400, style: "normal" },
        { name: "Source Serif 4", data: buffer(semibold), weight: 600, style: "normal" },
      ],
      characters,
    };
  })();
  loading.catch(() => (loading = undefined));
  return loading;
}

export type OgCard =
  | {
      kind: "verse";
      label: string;
      text: string;
      reference: string;
      translation?: string;
      // A highlight's color.
      color?: string;
      // A line under the verses: a highlight's note.
      note?: string;
      site: string;
    }
  | { kind: "article"; label: string; title: string; excerpt: string; site: string }
  | { kind: "page"; label?: string; title: string; subtitle?: string; site?: string };

const INK = "#1c1917";
const MUTED = "#57534e";
const PAPER = "#faf8f3";
const RULE = "#d6d3d1";

// Smaller type for longer text, so the verses fit.
const verseSize = (length: number) =>
  length <= 90 ? 60 : length <= 160 ? 50 : length <= 240 ? 42 : 36;

function cut(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}

export async function ogImage(card: OgCard, init: ResponseInit = {}): Promise<ImageResponse> {
  const { fonts, characters } = await loadFonts();
  const text = (value: string | undefined, limit: number) =>
    value ? cut(drawable(value, characters), limit) : "";
  const color: HighlightColor | undefined =
    card.kind === "verse" ? HIGHLIGHT_COLORS.find((choice) => choice.id === card.color) : undefined;

  const footer = (site: string | undefined, label?: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        fontSize: 28,
        color: MUTED,
        borderTop: `2px solid ${RULE}`,
        paddingTop: 24,
      }}
    >
      <span style={{ fontWeight: 600, color: INK }}>{text(site, 60)}</span>
      <span style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 22 }}>
        {text(label, 40)}
      </span>
    </div>
  );

  let body;
  if (card.kind === "verse") {
    const verses = text(card.text, 300);
    body = (
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            borderLeft: `14px solid ${color?.accent ?? RULE}`,
            backgroundColor: color ? color.light : "transparent",
            borderRadius: "0 12px 12px 0",
            padding: "28px 40px",
          }}
        >
          <div style={{ display: "flex", fontSize: verseSize(verses.length), lineHeight: 1.3, color: INK }}>
            {`“${verses}”`}
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 32, fontWeight: 600, color: INK }}>
            {text(card.reference, 80)}
            {card.translation && (
              <span style={{ marginLeft: 16, fontWeight: 400, color: MUTED }}>
                {text(card.translation, 20)}
              </span>
            )}
          </div>
        </div>
        {card.note && (
          <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: MUTED }}>
            {text(card.note, 110)}
          </div>
        )}
      </div>
    );
  } else if (card.kind === "article") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 600, lineHeight: 1.12, color: INK }}>
          {text(card.title, 110)}
        </div>
        {card.excerpt && (
          <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.4, color: MUTED }}>
            {text(card.excerpt, 180)}
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 600, lineHeight: 1.1, color: INK }}>
          {text(card.title, 70)}
        </div>
        {card.subtitle && (
          <div style={{ display: "flex", marginTop: 28, fontSize: 36, lineHeight: 1.4, color: MUTED }}>
            {text(card.subtitle, 160)}
          </div>
        )}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "56px 72px 48px",
          backgroundColor: PAPER,
          fontFamily: "Source Serif 4",
          gap: 32,
        }}
      >
        {body}
        {footer(card.site, card.label)}
      </div>
    ),
    { ...OG_SIZE, fonts, ...init },
  );
}
