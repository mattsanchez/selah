// The characters a TrueType or OpenType font has glyphs for, read from its
// `cmap` table (formats 4 and 12, the Unicode ones every modern font has).
//
// The Open Graph images (./image.tsx) draw only these: for a character no
// font it was given has, the image renderer would download a font or an
// emoji from the internet, and Selah's pages make no requests away from the
// site.

export function fontCharacters(font: Uint8Array): Set<number> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (view.getUint32(record) === 0x636d6170 /* "cmap" */) cmap = view.getUint32(record + 8);
  }
  if (cmap < 0) throw new Error("The font has no cmap table.");

  const characters = new Set<number>();
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const at = cmap + view.getUint32(cmap + 8 + i * 8);
    const format = view.getUint16(at);
    if (format === 4) readFormat4(view, at, characters);
    else if (format === 12) readFormat12(view, at, characters);
  }
  return characters;
}

function readFormat4(view: DataView, at: number, characters: Set<number>) {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const offset = view.getUint16(offsets + s * 2);
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph: number;
      if (offset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const index = offsets + s * 2 + offset + (code - start) * 2;
        glyph = view.getUint16(index);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) characters.add(code);
    }
  }
}

function readFormat12(view: DataView, at: number, characters: Set<number>) {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g++) {
    const group = at + 16 + g * 12;
    const start = view.getUint32(group);
    const end = view.getUint32(group + 4);
    const glyph = view.getUint32(group + 8);
    for (let code = start; code <= end; code++) {
      if (glyph + (code - start) !== 0) characters.add(code);
    }
  }
}

// The text with every character the font cannot draw left out. Spaces and
// line breaks always stay.
export function drawable(text: string, characters: ReadonlySet<number>): string {
  let kept = "";
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (characters.has(code) || character === " " || character === "\n") kept += character;
  }
  return kept.replace(/ {2,}/g, " ");
}
