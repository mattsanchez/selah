import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { drawable, fontCharacters } from "./cmap";
import { ogImage } from "./image";

const font = readFileSync(new URL("../../fonts/source-serif-4/SourceSerif4-Regular.ttf", import.meta.url));

describe("fontCharacters", () => {
  const characters = fontCharacters(font);

  it("reads the characters the font draws", () => {
    for (const character of "Aaé“”’—…αβΩжЖ0") {
      expect(characters.has(character.codePointAt(0)!), character).toBe(true);
    }
  });

  it("leaves out what it does not draw", () => {
    for (const character of ["🙏", "中", "א"]) {
      expect(characters.has(character.codePointAt(0)!), character).toBe(false);
    }
  });

  it("makes text drawable by leaving those out", () => {
    expect(drawable("Grace 🙏 upon 中 grace", characters)).toBe("Grace upon grace");
  });
});

describe("ogImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws a PNG with nothing but the app's own files, whatever the text", async () => {
    // The renderer reads its own WebAssembly from data: URLs; anything else
    // would be the network.
    const realFetch = globalThis.fetch;
    const away: string[] = [];
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("data:")) return realFetch(input, init);
      away.push(url);
      return Promise.reject(new Error(`No network in this test: ${url}`));
    });
    const response = await ogImage({
      kind: "verse",
      label: "Highlight",
      text: "For God so loved the world 🙏 世界 שָׁלוֹם",
      reference: "John 3:16",
      translation: "BSB",
      color: "yellow",
      note: "A note ✨",
      site: "Selah",
    });
    const png = new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // 1200 × 630, from the PNG header.
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    expect(away).toEqual([]);
  });
});
